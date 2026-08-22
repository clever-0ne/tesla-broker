/*
  Tesla XTeam FX Trade — data store
  ----------------------------------
  Persistence layer with two backends, chosen by environment:

    DATABASE_URL set   -> Neon/Postgres (recommended on hosted deploys).
                          Every collection lives as one row in an `app_data`
                          table (name -> JSONB). Reads always come from the
                          in-memory cache (authoritative inside the process);
                          each mutation kicks off an async UPSERT so the DB
                          stays in sync. Per-collection FIFO chains keep the
                          write order identical to the JSON-file backend.

    DATABASE_URL unset -> JSON files under DATA_DIR (local dev; ./data by
                          default). Atomic temp-file + rename writes.

  Callers use the same synchronous API in both modes, so switching storage
  is purely a matter of setting DATABASE_URL — no code changes elsewhere.
  Call `await store.init()` once at boot before the server listens.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || '';

const cache = {};
let pool = null;        // pg.Pool when DATABASE_URL is set
let ready = false;
const writeTails = {};  // per-collection FIFO chains (Postgres mode)

// Collections the app relies on; seeded as empty on first boot.
const DEFAULTS = ['users', 'sessions', 'deposits', 'orders', 'withdrawals', 'notifications', 'settings', 'chats'];

function defaultsFor(name) {
  return name === 'settings' ? {} : [];
}

/* ------------------------- Postgres backend ------------------------- */

async function connectPg() {
  // pg does not honour sslmode / channel_binding in the URL, so strip the
  // query string and set TLS explicitly (Neon requires TLS).
  const conn = String(DATABASE_URL).split('?')[0];
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: conn, ssl: { rejectUnauthorized: false }, max: 5 });
  await p.query('CREATE TABLE IF NOT EXISTS app_data (name TEXT PRIMARY KEY, data JSONB NOT NULL)');
  return p;
}

// Queues an async UPSERT for one collection. Order is preserved because each
// collection only starts its write after the previous one finished.
function persist(name) {
  const body = JSON.stringify(cache[name]);
  const tail = writeTails[name] || Promise.resolve();
  const write = tail.then(function () {
    return pool.query(
      'INSERT INTO app_data (name, data) VALUES ($1, $2::jsonb) ' +
      'ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
      [name, body]
    );
  });
  write.catch(function (err) { console.error('[store] Postgres write failed for ' + name + ': ' + err.message); });
  writeTails[name] = write.catch(function () { /* the chain survives a failed write */ });
  return write;
}

/* --------------------------- JSON backend --------------------------- */

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(name) {
  ensureDir();
  const file = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(file)) {
    cache[name] = defaultsFor(name);
    fs.writeFileSync(file, JSON.stringify(cache[name], null, 2));
    return cache[name];
  }
  try {
    cache[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    cache[name] = defaultsFor(name);
  }
  return cache[name];
}

function saveJson(name) {
  ensureDir();
  const file = path.join(DATA_DIR, name + '.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache[name], null, 2));
  fs.renameSync(tmp, file);
}

/* --------------------------- boot / API ----------------------------- */

// Load everything from the configured backend. Await once at boot, before
// the HTTP server starts listening. Fails loudly when Postgres is unreachable
// so a broken DATABASE_URL can't silently serve an empty database.
async function init() {
  if (ready) return;
  ready = true;
  if (!DATABASE_URL) return;
  pool = await connectPg();
  const res = await pool.query('SELECT name, data FROM app_data');
  for (const row of res.rows) cache[row.name] = row.data;
  for (const name of DEFAULTS) {
    if (!(name in cache)) { cache[name] = defaultsFor(name); await persist(name); }
  }
}

function get(name) {
  if (!(name in cache)) {
    if (pool) { cache[name] = defaultsFor(name); persist(name); }
    else loadJson(name);
  }
  return cache[name];
}

function save(name) {
  if (pool) persist(name);
  else saveJson(name);
}

module.exports = {
  init,
  get,
  set(name, value) { cache[name] = value; save(name); return value; },
  push(name, item) { const arr = this.get(name); arr.push(item); save(name); return item; },
  update(name, fn) { const result = fn(this.get(name)); save(name); return result; },
  save
};
