'use strict';

function log(debug) {
  if (debug) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    args.unshift("[le/lib/core.js]");
    console.log.apply(console, args);
  }
}

module.exports.create = function (le) {
  var PromiseA = require('bluebird');
  var utils = require('./utils');
  var RSA = PromiseA.promisifyAll(require('rsa-compat').RSA);

  var core = {
    //
    // Helpers
    //
    getAcmeUrlsAsync: function (args) {
      var now = Date.now();

      // TODO check response header on request for cache time
      if ((now - le._ipc.acmeUrlsUpdatedAt) < 10 * 60 * 1000) {
        return PromiseA.resolve(le._ipc.acmeUrls);
      }

      return le.acme.getAcmeUrlsAsync(args.server).then(function (data) {
        le._ipc.acmeUrlsUpdatedAt = Date.now();
        le._ipc.acmeUrls = data;

        return le._ipc.acmeUrls;
      });
    }


    //
    // The Main Enchilada
    //

    //
    // Accounts
    //
  , accounts: {
      // Accounts
      registerAsync: function (args) {
        var err;
        var copy = utils.merge(args, le);
        var disagreeTos;
        args = utils.tplCopy(copy);

        disagreeTos = (!args.agreeTos && 'undefined' !== typeof args.agreeTos);
        if (!args.email || disagreeTos || (parseInt(args.rsaKeySize, 10) < 2048)) {
          err = new Error(
            "In order to register an account both 'email' and 'agreeTos' must be present"
              + " and 'rsaKeySize' must be 2048 or greater."
          );
          err.code = 'E_ARGS';
          return PromiseA.reject(err);
        }

        return utils.testEmail(args.email).then(function () {
          var keypairOpts = { public: true, pem: true };

          var promise = le.store.accounts.checkKeypairAsync(args).then(function (keypair) {
            if (keypair) {
              return RSA.import(keypair);
            }

            if (args.accountKeypair) {
              return le.store.accounts.setKeypairAsync(args, RSA.import(args.accountKeypair));
            }

            return RSA.generateKeypairAsync(args.rsaKeySize, 65537, keypairOpts).then(function (keypair) {
              keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
              keypair.publicKeyPem = RSA.exportPublicPem(keypair);
              keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
              return le.store.accounts.setKeypairAsync(args, keypair);
            });
          });

          return promise.then(function (keypair) {
            // Note: the ACME urls are always fetched fresh on purpose
            // TODO is this the right place for this?
            return core.getAcmeUrlsAsync(args).then(function (urls) {
              args._acmeUrls = urls;

              return le.acme.registerNewAccountAsync({
                email: args.email
              , newRegUrl: args._acmeUrls.newReg
              , agreeToTerms: function (tosUrl, agreeCb) {
                  if (true === args.agreeTos || tosUrl === args.agreeTos || tosUrl === le.agreeToTerms) {
                    agreeCb(null, tosUrl);
                    return;
                  }

                  // args.email = email;      // already there
                  // args.domains = domains   // already there
                  args.tosUrl = tosUrl;
                  le.agreeToTerms(args, agreeCb);
                }
              , accountKeypair: keypair

              , debug: le.debug || args.debug
              }).then(function (receipt) {
                var reg = {
                  keypair: keypair
                , receipt: receipt
                , email: args.email
                };

                // TODO move templating of arguments to right here?
                return le.store.accounts.setAsync(args, reg).then(function (account) {
                  // should now have account.id and account.accountId
                  args.account = account;
                  args.accountId = account.id;
                  return account;
                });
              });
            });
          });
        });
      }

      // Accounts
    , getAsync: function (args) {
        return core.accounts.checkAsync(args).then(function (account) {
          if (account) {
            return account;
          } else {
            return core.accounts.registerAsync(args);
          }
        });
      }

      // Accounts
    , checkAsync: function (args) {
        var requiredArgs = ['accountId', 'email', 'domains', 'domain'];
        if (!requiredArgs.some(function (key) { return -1 !== Object.keys(args).indexOf(key); })) {
          return PromiseA.reject(new Error(
            "In order to register or retrieve an account one of '" + requiredArgs.join("', '") + "' must be present"
          ));
        }

        var copy = utils.merge(args, le);
        args = utils.tplCopy(copy);

        return le.store.accounts.checkAsync(args).then(function (account) {

          if (!account) {
            return null;
          }

          args.account = account;
          args.accountId = account.id;

          return account;
        });
      }
    }

  , certificates: {
      // Certificates
      registerAsync: function (args) {
        var err;
        var copy = utils.merge(args, le);
        args = utils.tplCopy(copy);

        if (!Array.isArray(args.domains)) {
          return PromiseA.reject(new Error('args.domains should be an array of domains'));
        }

        if (!(args.domains.length && args.domains.every(utils.isValidDomain))) {
          // NOTE: this library can't assume to handle the http loopback
          // (or dns-01 validation may be used)
          // so we do not check dns records or attempt a loopback here
          err = new Error("invalid domain name(s): '" + args.domains + "'");
          err.code = "INVALID_DOMAIN";
          return PromiseA.reject(err);
        }

        // TODO renewal cb
        // accountId and or email
        return core.accounts.getAsync(copy).then(function (account) {
          copy.account = account;

          //var account = args.account;
          var keypairOpts = { public: true, pem: true };

          var promise = le.store.certificates.checkKeypairAsync(args).then(function (keypair) {
            if (keypair) {
              return RSA.import(keypair);
            }

            if (args.domainKeypair) {
              return le.store.certificates.setKeypairAsync(args, RSA.import(args.domainKeypair));
            }

            return RSA.generateKeypairAsync(args.rsaKeySize, 65537, keypairOpts).then(function (keypair) {
              keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
              keypair.publicKeyPem = RSA.exportPublicPem(keypair);
              keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
              return le.store.certificates.setKeypairAsync(args, keypair);
            });
          });

          return promise.then(function (domainKeypair) {
            args.domainKeypair = domainKeypair;
            //args.registration = domainKey;

            // Note: the ACME urls are always fetched fresh on purpose
            // TODO is this the right place for this?
            return core.getAcmeUrlsAsync(args).then(function (urls) {
              args._acmeUrls = urls;

              var certReq = {
                debug: args.debug || le.debug

              , newAuthzUrl: args._acmeUrls.newAuthz
              , newCertUrl: args._acmeUrls.newCert

              , accountKeypair: RSA.import(account.keypair)
              , domainKeypair: domainKeypair
              , domains: args.domains
              , challengeType: args.challengeType
              };

              //
              // IMPORTANT
              //
              // setChallenge and removeChallenge are handed defaults
              // instead of args because getChallenge does not have
              // access to args
              // (args is per-request, defaults is per instance)
              //
              // Each of these fires individually for each domain,
              // even though the certificate on the whole may have many domains
              //
              certReq.setChallenge = function (domain, key, value, done) {
                log(args.debug, "setChallenge called for '" + domain + "'");
                var copy = utils.merge({ domains: [domain] }, le);
                utils.tplCopy(copy);

                le.challenge.set(copy, domain, key, value, done);
              };
              certReq.removeChallenge = function (domain, key, done) {
                log(args.debug, "setChallenge called for '" + domain + "'");
                var copy = utils.merge({ domains: [domain] }, le);
                utils.tplCopy(copy);

                le.challenge.remove(copy, domain, key, done);
              };

              log(args.debug, 'BEFORE GET CERT');
              log(args.debug, certReq);

              return le.acme.getCertificateAsync(certReq).then(utils.attachCertInfo);
            });
          }).then(function (results) {
            // { cert, chain, privkey }

            args.pems = results;
            return le.store.certificates.setAsync(args).then(function () {
              return results;
            });
          });
        });
      }
      // Certificates
    , renewAsync: function (args) {
        // TODO fetch email address (accountBydomain) if not present
        // store.config.getAsync(args.domains).then(function (config) { /*...*/ });
        return core.certificates.registerAsync(args);
      }
      // Certificates
    , checkAsync: function (args) {
        var copy = utils.merge(args, le);
        utils.tplCopy(copy);

        // returns pems
        return le.store.certificates.checkAsync(copy).then(function (cert) {
          if (cert) {
            return utils.attachCertInfo(cert);
          }

          return null;
        });
      }
      // Certificates
    , getAsync: function (args) {
        var copy = utils.merge(args, le);
        args = utils.tplCopy(copy);

        return core.certificates.checkAsync(args).then(function (certs) {
          if (!certs) {
            // There is no cert available
            log(args.debug, "no certificate found");
            return core.certificates.registerAsync(args);
          }

          var renewableAt = certs.expiresAt - le.renewWithin;
          //var halfLife = (certs.expiresAt - certs.issuedAt) / 2;
          //var renewable = (Date.now() - certs.issuedAt) > halfLife;

          log(args.debug, "Expires At", new Date(certs.expiresAt).toISOString());
          log(args.debug, "Renewable At", new Date(renewableAt).toISOString());
          if (args.duplicate || Date.now() >= renewableAt) {
            // The cert is more than half-expired
            // We're forcing a refresh via 'dupliate: true'
            log(args.debug, "Renewing!");
            if (Array.isArray(certs.domains) && certs.domains.length && args.domains.length <= 2) {
              // this is a renewal, therefore we should renewal ALL of the domains
              // associated with this certificate, unless args.domains is a list larger
              // than example.com,www.example.com
              // TODO check www. prefix
              args.domains = certs.domains;
            }
            return core.certificates.renewAsync(args);
          }

          return PromiseA.reject(new Error(
              "[ERROR] Certificate issued at '"
            + new Date(certs.issuedAt).toISOString() + "' and expires at '"
            + new Date(certs.expiresAt).toISOString() + "'. Ignoring renewal attempt until '"
            + new Date(renewableAt).toISOString() + "'. Set { duplicate: true } to force."
          ));
        }).then(function (results) {
          // returns pems
          return results;
        });
      }
    }

  };

  return core;
};
