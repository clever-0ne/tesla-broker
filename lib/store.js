/*
  Tesla XTeam FX Trade — JSON data store
  --------------------------------------
  Minimal persistence layer. Every collection lives in one JSON file
  under ./data and is kept in memory; writes are atomic (temp file +
  rename) so a failed write can never corrupt existing data.
*/
'use strict';

const fs = require('fs');
const path = require('path');

// Overridable so a host can point storage at a persistent disk
// (e.g. Render: DATA_DIR=/var/data). Defaults to ./data next to the app.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const cache = {};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(name) {
  ensureDir();
  const file = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(file)) {
    cache[name] = name === 'settings' ? {} : [];
    fs.writeFileSync(file, JSON.stringify(cache[name], null, 2));
    return cache[name];
  }
  try {
    cache[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    cache[name] = name === 'settings' ? {} : [];
  }
  return cache[name];
}

function save(name) {
  ensureDir();
  const file = path.join(DATA_DIR, name + '.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache[name], null, 2));
  fs.renameSync(tmp, file);
}

module.exports = {
  get(name) {
    if (!(name in cache)) load(name);
    return cache[name];
  },
  set(name, value) {
    cache[name] = value;
    save(name);
    return value;
  },
  push(name, item) {
    const arr = this.get(name);
    arr.push(item);
    save(name);
    return item;
  },
  update(name, fn) {
    const result = fn(this.get(name));
    save(name);
    return result;
  },
  save
};
