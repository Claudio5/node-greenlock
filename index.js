'use strict';

var leCore = require('letiny-core');

var LE = module.exports;
// in-process cache, shared between all instances
var ipc = {};

LE.defaults = {
  productionServerUrl: leCore.productionServerUrl
, stagingServerUrl: leCore.stagingServerUrl

, rsaKeySize: leCore.rsaKeySize || 2048
, challengeType: leCore.challengeType || 'http-01'

, acmeChallengePrefix: leCore.acmeChallengePrefix
};

// backwards compat
Object.keys(LE.defaults).forEach(function (key) {
  LE[key] = LE.defaults[key];
});

// show all possible options
var u; // undefined
LE._undefined = {
  store: u
, challenger: u
, register: u
, check: u
, renewWithin: u
, memorizeFor: u
, acmeChallengePrefix: u
, rsaKeySize: u
, challengeType: u
, server: u
, agreeToTerms: u
, _ipc: u
};
LE._undefine = function (le) {
  Object.keys(LE._undefined).forEach(function (key) {
    if (!(key in le)) {
      le[key] = u;
    }
  });

  return le;
};
LE.create = function (le) {
  var PromiseA = require('bluebird');

  le.store = le.store || require('le-store-certbot').create({ debug: le.debug });
  le.challenger = le.challenger || require('le-store-certbot').create({ debug: le.debug });
  le.core = require('./lib/core');

  le = LE._undefine(le);
  le.acmeChallengePrefix = LE.acmeChallengePrefix;
  le.rsaKeySize = le.rsaKeySize || LE.rsaKeySize;
  le.challengeType = le.challengeType || LE.challengeType;
  le._ipc = ipc;

  if (!le.renewWithin) { le.renewWithin = 3 * 24 * 60 * 60 * 1000; }
  if (!le.memorizeFor) { le.memorizeFor = 1 * 24 * 60 * 60 * 1000; }

  if (!le.server) {
    throw new Error("opts.server must be set to 'staging' or a production url, such as LE.productionServerUrl'");
  }
  if ('staging' === le.server) {
    le.server = LE.stagingServerUrl;
  }
  else if ('production' === le.server) {
    le.server = LE.productionServerUrl;
  }

  if (le.store.create) {
    le.store = le.store.create(le);
  }
  le.store = PromiseA.promisifyAll(le.store);
  le._storeOpts = le.store.getOptions();
  Object.keys(le._storeOpts).forEach(function (key) {
    if (!(key in le._storeOpts)) {
      le[key] = le._storeOpts[key];
    }
  });

  if (le.challenger.create) {
    le.challenger = le.challenger.create(le);
  }
  le.challenger = PromiseA.promisifyAll(le.challenger);
  le._challengerOpts = le.challenger.getOptions();
  Object.keys(le._storeOpts).forEach(function (key) {
    if (!(key in le._challengerOpts)) {
      le[key] = le._challengerOpts[key];
    }
  });

  if (le.core.create) {
    le.core = le.core.create(le);
  }

  le.register = function (args) {
    return le.core.registerAsync(args);
  };

  le.check = function (args) {
    // TODO must return email, domains, tos, pems
    return le.core.fetchAsync(args);
  };

  le.middleware = function () {
    return require('./lib/middleware')(le);
  };

  return le;
};
