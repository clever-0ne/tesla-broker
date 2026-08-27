/*
  Vercel serverless entry point.
  ------------------------------
  Vercel imports this file as an HTTP function. It boots storage once per
  warm instance (store.init() is memoised), hydrates sessions / seeds the
  admin account, then hands the request to the Express app exported by
  server.js.
*/
'use strict';

const store = require('../lib/store');
const auth = require('../lib/auth');
const app = require('../server');

let bootPromise;
function boot() {
  if (!bootPromise) {
    bootPromise = store.init().then(function () {
      auth.hydrateSessions();
      auth.seedAdmin();
    });
  }
  return bootPromise;
}

module.exports = async function handler(req, res) {
  await boot();
  return app(req, res);
};
