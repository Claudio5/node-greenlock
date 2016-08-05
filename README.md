[![Join the chat at https://gitter.im/Daplie/letsencrypt-express](https://badges.gitter.im/Daplie/letsencrypt-express.svg)](https://gitter.im/Daplie/letsencrypt-express?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

| **letsencrypt** (library)
| [letsencrypt-cli](https://github.com/Daplie/letsencrypt-cli)
| [letsencrypt-express](https://github.com/Daplie/letsencrypt-express)
| [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa)
| [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi)
|

letsencrypt
===========

Automatic [Let's Encrypt](https://letsencrypt.org) HTTPS / TLS / SSL Certificates for node.js

  * [Automatic HTTPS with ExpressJS](https://github.com/Daplie/letsencrypt-express)
  * [Automatic live renewal](https://github.com/Daplie/letsencrypt-express#how-automatic)
  * On-the-fly HTTPS certificates for Dynamic DNS (in-process, no server restart)
  * Works with node cluster out of the box
  * usable [via commandline](https://github.com/Daplie/letsencrypt-cli) as well
  * Free SSL (HTTPS Certificates for TLS)
  * [90-day certificates](https://letsencrypt.org/2015/11/09/why-90-days.html)

**See Also**

* [Let's Encrypt in (exactly) 90 seconds with Caddy](https://daplie.com/articles/lets-encrypt-in-literally-90-seconds/)
* [lego](https://github.com/xenolf/lego): Let's Encrypt for golang

STOP
====

**These aren't the droids you're looking for.**

This is a **low-level library** for implementing ACME / LetsEncrypt Clients, CLIs,
system tools, and abstracting storage backends (file vs db, etc).

This is not the thing to use in your webserver directly.

### Use [letsencrypt-express](https://github.com/Daplie/letsencrypt-express) if...

you are planning to use one of these:

  * `express`
  * `connect`
  * raw `https`
  * raw `spdy`
  * `restify` (same as raw https)
  * `hapi` See [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi)
  * `koa` See [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa)
  * `rill` (similar to koa example)

### Use [letsencrypt-cli](https://github.com/Daplie/letsencrypt-cli) if...

You are planning to use one of these:

  * `bash`
  * `fish`
  * `zsh`
  * `cmd.exe`
  * `PowerShell`

CONTINUE
========

If you're sure you're at the right place, here's what you need to know now:

Install
-------

```bash
npm install --save letsencrypt@2.x
npm install --save le-store-certbot@2.x
npm install --save le-challenge-fs@2.x
```

Usage
-----

It's very simple and easy to use, but also very complete and easy to extend and customize.

### Overly Simplified Example

Against my better judgement I'm providing a terribly oversimplified exmaple
of how to use this library:

```javascript
var app = express();

var le = require('letsencrypt').create({ server: 'staging' });

app.use('/', le.middleware());

var reg = {
  domains: ['example.com']
, email: 'user@email.com'
, agreeTos: true
};

le.register(reg, function (err, results) {
  if (err) {
    console.error(err.stack);
    return;
  }

  console.log(results);
});
```

### Useful Example

The configuration consists of 3 components:

* Storage Backend (search npm for projects starting with 'le-store-')
* ACME Challenge Handlers (search npm for projects starting with 'le-challenge-')
* Letsencryt Config (this is all you)

```javascript
'use strict';

var LE = require('letsencrypt');
var le;


// Storage Backend
var leStore = require('le-store-certbot').create({
  configDir: '~/letsencrypt/etc'                          // or /etc/letsencrypt or wherever
, debug: false
});


// ACME Challenge Handlers
var leChallenger = require('le-challenge-fs').create({
  webrootPath: '~/letsencrypt/var/'                       // or template string such as
, debug: false                                            // '/srv/www/:hostname/.well-known/acme-challenge'
});


function leAgree(opts, agreeCb) {
  // opts = { email, domains, tosUrl }
  agreeCb(null, opts.tosUrl);
}

le = LE.create({
  server: LE.stagingServerUrl                             // or LE.productionServerUrl
, store: leStore                                          // handles saving of config, accounts, and certificates
, challenger: leChallenger                                // handles /.well-known/acme-challege keys and tokens
, agreeToTerms: leAgree                                   // hook to allow user to view and accept LE TOS
, debug: false
});


// If using express you should use the middleware
// app.use('/', le.middleware());
//
// Otherwise you should use the wrapped getChallenge:
// le.getChallenge(domain, key, val, done)



// Check in-memory cache of certificates for the named domain
le.exists({ domain: 'example.com' }).then(function (results) {
  if (results) {
    // we already have certificates
    return;
  }

  // Register Certificate manually
  le.register(

    { domains: ['example.com']                                // CHANGE TO YOUR DOMAIN (list for SANS)
    , email: 'user@email.com'                                 // CHANGE TO YOUR EMAIL
    , agreeTos: ''                                            // set to tosUrl string to pre-approve (and skip agreeToTerms)
    , rsaKeySize: 2048                                        // 1024 or 2048
    , challengeType: 'http-01'                                // http-01, tls-sni-01, or dns-01
    }

  , function (err, results) {
      if (err) {
        // Note: you must either use le.middleware() with express,
        // manually use le.getChallenge(domain, key, val, done)
        // or have a webserver running and responding
        // to /.well-known/acme-challenge at `webrootPath`
        console.error('[Error]: node-letsencrypt/examples/standalone');
        console.error(err.stack);
        return;
      }

      console.log('success');
    }

  );

});
```

Here's what `results` looks like:

```javascript
{ privkey: ''     // PEM encoded private key
, cert: ''        // PEM encoded cert
, chain: ''       // PEM encoded intermediate cert
, fullchain: ''   // cert + chain
, issuedAt: 0     // notBefore date (in ms) parsed from cert
, expiresAt: 0    // notAfter date (in ms) parsed from cert
}
```

API
---

The full end-user API is exposed in the example above and includes all relevant options.

### Helper Functions

We do expose a few helper functions:

* LE.validDomain(hostname) // returns '' or the hostname string if it's a valid ascii or punycode domain name

TODO fetch domain tld list

Developer API
-------------

If you are developing an `le-store-*` or `le-challenge-*` plugin you need to be aware of
additional internal API expectations.

**IMPORTANT**:

Use `v2.0.0` as your initial version - NOT v0.1.0 and NOT v1.0.0 and NOT v3.0.0.
This is to indicate that your module is compatible with v2.x of node-letsencrypt.

Since the public API for your module is defined by node-letsencrypt the major version
should be kept in sync.

### store implementation

TODO double check and finish

* accounts
  * accounts.byDomain
  * accounts.all
  * accounts.get
  * accounts.exists
* certs
  * certs.byDomain
  * certs.all
  * certs.get
  * certs.exists

### challenge implementation

TODO finish

* setChallenge(opts, domain, key, value, done);   // opts will be saved with domain/key
* getChallenge(domain, key, done);                // opts will be retrieved by domain/key
* removeChallenge(domain, key, done);             // opts will be retrieved by domain/key

Change History
==============

* v2.0.0 - Aug 5th 2016
  * major refactor
  * simplified API
  * modular pluigns
  * knock out bugs
* v1.5.0 now using letiny-core v2.0.0 and rsa-compat
* v1.4.x I can't remember... but it's better!
* v1.1.0 Added letiny-core, removed node-letsencrypt-python
* v1.0.2 Works with node-letsencrypt-python
* v1.0.0 Thar be dragons

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
