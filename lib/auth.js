/*
  Tesla XTeam FX Trade — authentication & sessions
  -------------------------------------------------
  scrypt password hashing, server-side session tokens in an httpOnly
  cookie, and Express middleware for page/API/admin protection.
*/
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

// Storage lives where the store says it lives (DATA_DIR env, default ./data) —
// keep auth's file writes on the same disk, so on a host with a persistent
// mount (e.g. Render: DATA_DIR=/var/data) credentials land there too.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 days
const COOKIE = 'sid';

/* ------------------------- password hashing ------------------------- */

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function createUser({ name, email, password, role }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(name).slice(0, 60),
    email: String(email).trim().toLowerCase(),
    passwordHash: hashPassword(password, salt),
    salt,
    role: role || 'user',
    balance: 0,
    kycStatus: 'not_submitted',
    profileImage: '',
    idImages: [],
    blocked: false,
    createdAt: Date.now()
  };
  store.push('users', user);
  return user;
}

function findUserByEmail(email) {
  return store.get('users').find(function (u) { return u.email === String(email || '').trim().toLowerCase(); });
}

function findUserById(id) {
  return store.get('users').find(function (u) { return u.id === id; });
}

function verifyPassword(user, password) {
  const expected = Buffer.from(hashPassword(password, user.salt), 'hex');
  const actual = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/* --------------------------- sessions ------------------------------ */

// in-memory token -> { userId, expiresAt }; hydrated from disk on boot
const sessionMap = new Map();

function hydrateSessions() {
  store.get('sessions').forEach(function (s) {
    if (s.expiresAt > Date.now()) sessionMap.set(s.token, { userId: s.userId, expiresAt: s.expiresAt });
  });
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const rec = { userId: userId, expiresAt: Date.now() + SESSION_TTL };
  sessionMap.set(token, rec);
  store.push('sessions', { token: token, userId: userId, expiresAt: rec.expiresAt });
  await store.flush();
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const rec = sessionMap.get(token);
  if (rec) {
    if (rec.expiresAt > Date.now()) return rec;
    sessionMap.delete(token);
    return null;
  }
  // Not in this instance's in-memory map (e.g. the session was created by a
  // different serverless instance). Read fresh from the database.
  try {
    const sessions = await store.getFresh('sessions');
    for (const s of sessions) {
      if (s.token !== token) continue;
      if (s.expiresAt > Date.now()) {
        sessionMap.set(token, { userId: s.userId, expiresAt: s.expiresAt });
        return { userId: s.userId, expiresAt: s.expiresAt };
      }
      return null;
    }
  } catch (e) { /* fall through to null */ }
  return null;
}

function destroySession(token) {
  if (!token) return;
  sessionMap.delete(token);
  store.update('sessions', function (arr) { return arr.filter(function (s) { return s.token !== token; }); });
}

// Drop every active session owned by a user (used when deleting an account).
function destroyUserSessions(userId) {
  let changed = false;
  sessionMap.forEach(function (rec, token) {
    if (rec.userId === userId) { sessionMap.delete(token); changed = true; }
  });
  if (changed) {
    store.update('sessions', function (arr) { return arr.filter(function (s) { return s.userId !== userId; }); });
  }
}

/* ------------------------- cookie helpers --------------------------- */

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(header);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return null; }
}

// Resolve the logged-in user for any request, or null.
async function authenticate(req) {
  const token = readCookie(req, COOKIE);
  const rec = await getSession(token);
  if (!rec) return null;
  const user = findUserById(rec.userId);
  if (user && user.blocked) {
    destroySession(token);
    return null;
  }
  return user || null;
}

/* ------------------------- Express middleware ----------------------- */

async function requireAuthApi(req, res, next) {
  req.user = await authenticate(req);
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

async function requireAdminApi(req, res, next) {
  req.user = await authenticate(req);
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
    secure: process.env.HTTPS === 'true'
  };
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, cookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

/* --------------------------- admin account ------------------------- */

// The admin console is a password-only login — no username/email prompt.
// Default 'biggod'; override with the ADMIN_PASSWORD env var if you want
// a different password in a deployed environment.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'biggod';

function seedAdmin() {
  const users = store.get('users');
  let admin = users.find(function (u) { return u.role === 'admin'; });
  if (!admin) {
    // First boot: create the admin account with the configured password.
    admin = createUser({ name: 'Administrator', email: 'admin@xteam.local', password: ADMIN_PASSWORD, role: 'admin' });
    store.save('users');
  } else if (!admin.salt || !admin.passwordHash) {
    // The seeded admin lost its credentials — (re)set them from the env var.
    admin.salt = crypto.randomBytes(16).toString('hex');
    admin.passwordHash = hashPassword(ADMIN_PASSWORD, admin.salt);
    store.save('users');
  }
  // NOTE: we no longer overwrite a known-good admin password on every boot.
  // The password is only (re)set when the admin account is missing or has no
  // stored credentials, so a corrected record persists across restarts.
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, 'admin-credentials.txt'),
      'Tesla XTeam FX Trade — Admin Console\n' +
      '------------------------------------\n' +
      'Password: ' + ADMIN_PASSWORD + '\n'
    );
  } catch (e) { /* non-fatal */ }
  console.log('[server] Admin console ready — default password: ' + ADMIN_PASSWORD);
}

module.exports = {
  COOKIE,
  hashPassword,
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  hydrateSessions,
  createSession,
  destroySession,
  destroyUserSessions,
  readCookie,
  authenticate,
  requireAuthApi,
  requireAdminApi,
  cookieOptions,
  setSessionCookie,
  clearSessionCookie,
  seedAdmin
};
