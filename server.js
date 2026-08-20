/*
  Tesla XTeam FX Trade — Express server
  --------------------------------------
  Serves the static site, protects dashboard pages behind login, and
  exposes the auth / balance / deposit / order / admin APIs.

  Run:  npm start   (or  node server.js)
  First run creates an admin account and prints the credentials.
*/
'use strict';

// Load local config (.env) before anything reads process.env — keeps secrets
// (DATABASE_URL, ADMIN_PASSWORD) out of the repo. On Render the same vars are
// set in the dashboard, so this is a no-op there.
require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./lib/store');
const auth = require('./lib/auth');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const app = express();
// Hide the Express fingerprint header.
app.disable('x-powered-by');
// Render sits behind a reverse proxy. Without this, req.ip is always the
// proxy's address, so per-IP rate limiting would treat every visitor as one
// user — a single attacker's 10 attempts would lock out the whole site.
app.set('trust proxy', 1);

/* ------------------------------ settings ------------------------------ */

const COINS = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC', network: 'BTC network' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', network: 'ERC-20' },
  { id: 'usdt', name: 'Tether', symbol: 'USDT', network: 'TRC-20' },
  { id: 'sol', name: 'Solana', symbol: 'SOL', network: 'Solana' }
];

const DEFAULT_SETTINGS = {
  siteName: 'Tesla XTeam FX Trade',
  depositAddresses: {
    btc: 'bc1qxtfxtrdepplaceholderaddress0001',
    eth: '0x8F3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    usdt: 'TXTeamFXTradeDepositPlaceholderAddress001',
    sol: 'XTeamFXTradeSolanaDepositPlaceholderAddress0001'
  },
  coinRates: { btc: 67420.15, eth: 3510.80, usdt: 1.0, sol: 172.35 },
  coins: COINS
};

function getSettings() {
  const s = store.get('settings');
  return {
    siteName: s.siteName || DEFAULT_SETTINGS.siteName,
    depositAddresses: Object.assign({}, DEFAULT_SETTINGS.depositAddresses, s.depositAddresses || {}),
    coinRates: Object.assign({}, DEFAULT_SETTINGS.coinRates, s.coinRates || {}),
    coins: COINS
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function roundCoin(n) { return Math.round((Number(n) || 0) * 1e8) / 1e8; }
// Record IDs — crypto bytes (not Math.random) so they can't be predicted.
function uid() { return crypto.randomBytes(6).toString('hex'); }

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, balance: u.balance, kycStatus: u.kycStatus, createdAt: u.createdAt, profileImage: u.profileImage, blocked: u.blocked };
}

/* ----------------------------- middleware ----------------------------- */

app.use(express.json({ limit: '100kb' }));
app.use(function (req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.HTTPS === 'true') res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// Same-origin defence: mutating requests must come from the same host.
// (SameSite=Lax cookies are the primary cross-site defence; this is belt-and-braces.)
app.use(function (req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  const host = req.get('host');
  // Some browsers send "Origin: null" for sandboxed/privacy contexts — allow it.
  if (origin && origin !== 'null' && host) {
    let originHost = origin;
    try { originHost = new URL(origin).host; } catch (e) { /* keep raw string */ }
    // Exact match only — a substring check would let https://evil-example.com
    // through when the site lives at example.com. Default ports are normalised
    // so Origin: https://site.com still matches a Host header of site.com.
    const stripPort = function (h) { return h.replace(/:(80|443)$/, ''); };
    if (stripPort(originHost).toLowerCase() !== stripPort(host).toLowerCase()) {
      return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
  }
  next();
});

// Simple in-memory rate limiter for auth endpoints.
const authHits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || 'local';
  const now = Date.now();
  // Opportunistically prune expired buckets so the map can't grow forever.
  if (authHits.size > 10000) {
    authHits.forEach(function (rec, key) { if (rec.resetAt < now) authHits.delete(key); });
  }
  let rec = authHits.get(ip);
  if (!rec || rec.resetAt < now) rec = { count: 0, resetAt: now + 60000 };
  rec.count++;
  authHits.set(ip, rec);
  if (rec.count > 10) return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
  next();
}

/* ------------------------------- static ------------------------------- */

// Public marketing / auth pages only. Every other page requires login.
app.use('/pages', function (req, res, next) {
  // Only the real /pages/index.html is public. Matching the *basename* would
  // let any nested index.html (e.g. /pages/dashboard/index.html) dodge auth.
  const p = req.path.replace(/\/+$/, '').toLowerCase();
  if (p === '/index.html') return next();
  const user = auth.authenticate(req);
  if (!user) return res.redirect('/pages/index.html#auth');
  // Admins may use the customer frontend too — the /admin guard below still
  // limits the console to admin accounts, so both areas work from one session.
  next();
}, express.static(path.join(ROOT, 'pages'), { index: false }));

// Admin area — isolated from the public site, with its own login page.
// Only /admin/login.html is reachable without a session; everything else
// under /admin requires an admin account.
const ADMIN_DIR = path.join(ROOT, 'admin');
app.use('/admin', function (req, res, next) {
  const p = req.path.replace(/\/+$/, '').toLowerCase();
  if (p === '/login.html' || p === '/favicon.ico') return next();
  const user = auth.authenticate(req);
  if (!user || user.role !== 'admin') return res.redirect('/admin/login.html');
  next();
}, express.static(ADMIN_DIR, { index: 'index.html' }));

app.get('/', function (req, res) { res.redirect('/pages/index.html'); });
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/dist', express.static(path.join(ROOT, 'dist')));

// Public root-level JS files (no sensitive data inside).
const ROOT_FILES = ['dashboard-shell.js', 'cars-data.js', 'crypto-data.js'];
app.get('/:file', function (req, res) {
  if (ROOT_FILES.indexOf(req.params.file) === -1) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.sendFile(path.join(ROOT, req.params.file));
});

/* ---------------------------- auth routes ----------------------------- */

app.post('/api/auth/signup', rateLimit, function (req, res) {
  req.body = req.body || {};
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Please enter your full name (2–60 characters).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8–72 characters.' });
  if (auth.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists.' });

  const users = store.get('users');
  const role = users.length === 0 ? 'admin' : 'user'; // first account = admin
  const user = auth.createUser({ name: name, email: email, password: password, role: role });
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', rateLimit, function (req, res) {
  req.body = req.body || {};
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = auth.findUserByEmail(email);
  if (!user || !auth.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.blocked) {
    return res.status(403).json({ error: 'Your account has been blocked. Please contact support for assistance.' });
  }
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', function (req, res) {
  auth.destroySession(auth.readCookie(req, auth.COOKIE));
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Admin console login — password only (no username/email prompt).
app.post('/api/admin/login', rateLimit, function (req, res) {
  req.body = req.body || {};
  const password = String(req.body.password || '');
  const admin = store.get('users').find(function (u) { return u.role === 'admin'; });
  if (!admin || !auth.verifyPassword(admin, password)) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  auth.setSessionCookie(res, auth.createSession(admin.id));
  res.json({ user: publicUser(admin) });
});

app.get('/api/me', auth.requireAuthApi, function (req, res) {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------- shared settings --------------------------- */

app.get('/api/settings', function (req, res) {
  res.json(getSettings());
});

/* --------------------------- user routes ----------------------------- */

app.get('/api/deposits', auth.requireAuthApi, function (req, res) {
  const list = store.get('deposits').filter(function (d) { return d.userId === req.user.id; });
  res.json({ deposits: list.reverse() });
});

app.post('/api/deposits', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const amount = round2(req.body.amount);
  const coin = String(req.body.coin || '').toLowerCase();
  const txid = String(req.body.txid || '').slice(0, 200);

  if (!(amount > 0) || amount > 10000000) return res.status(400).json({ error: 'Enter a valid deposit amount.' });
  if (!getSettings().coins.some(function (c) { return c.id === coin; })) {
    return res.status(400).json({ error: 'Unsupported cryptocurrency.' });
  }

  const settings = getSettings();
  const rate = settings.coinRates[coin];
  const deposit = {
    id: uid(),
    userId: req.user.id,
    userName: req.user.name,
    amount: amount,
    coin: coin,
    coinAmount: roundCoin(amount / rate),
    address: settings.depositAddresses[coin],
    txid: txid,
    status: 'pending',
    createdAt: Date.now()
  };
  store.push('deposits', deposit);
  notify(req.user.id, 'deposit', 'Deposit submitted', 'Your ' + coin.toUpperCase() + ' deposit of $' + amount.toFixed(2) + ' is awaiting approval.');
  res.status(201).json({ deposit: deposit });
});

app.get('/api/orders', auth.requireAuthApi, function (req, res) {
  const list = store.get('orders').filter(function (o) { return o.userId === req.user.id; });
  res.json({ orders: list.reverse() });
});

// Purchase / investment / crypto order — debits the balance immediately.
app.post('/api/orders', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const type = String(req.body.type || '').toLowerCase();
  const item = String(req.body.item || '').slice(0, 200);
  const amount = round2(req.body.amount);

  if (['vehicle', 'investment', 'crypto'].indexOf(type) === -1) return res.status(400).json({ error: 'Invalid order type.' });
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter a valid amount.' });
  if (req.user.balance < amount) return res.status(400).json({ error: 'Insufficient funds.' });

  req.user.balance = round2(req.user.balance - amount);
  store.save('users');

  const order = {
    id: uid(),
    userId: req.user.id,
    userName: req.user.name,
    type: type,
    item: item,
    amount: amount,
    status: 'completed',
    createdAt: Date.now()
  };
  store.push('orders', order);

  var orderNote = { investment: 'Investment confirmed', crypto: 'Trade executed', vehicle: 'Purchase confirmed' };
  notify(req.user.id, 'order', orderNote[type] || 'Order confirmed', 'You paid $' + amount.toFixed(2) + ' for ' + item + '.');
  res.status(201).json({ order: order, balance: req.user.balance });
});

/* -------------------------- notifications --------------------------- */

function notify(userId, kind, title, message) {
  store.push('notifications', {
    id: uid(),
    userId: userId,
    kind: kind,
    title: title,
    message: message,
    read: false,
    createdAt: Date.now()
  });
}

app.get('/api/notifications', auth.requireAuthApi, function (req, res) {
  const list = store.get('notifications').filter(function (n) { return n.userId === req.user.id; }).slice(-50).reverse();
  res.json({ notifications: list, unread: list.filter(function (n) { return !n.read; }).length });
});

app.post('/api/notifications/read', auth.requireAuthApi, function (req, res) {
  store.update('notifications', function (arr) {
    arr.forEach(function (n) { if (n.userId === req.user.id) n.read = true; });
    return arr;
  });
  res.json({ ok: true });
});

/* ---------------------------- withdrawals --------------------------- */

app.get('/api/withdrawals', auth.requireAuthApi, function (req, res) {
  const list = store.get('withdrawals').filter(function (w) { return w.userId === req.user.id; });
  res.json({ withdrawals: list.reverse() });
});

// Withdrawal request — debits the balance only after admin approval.
app.post('/api/withdrawals', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const amount = round2(req.body.amount);
  const coin = String(req.body.coin || '').toLowerCase();
  const address = String(req.body.address || '').trim().slice(0, 200);

  if (!(amount > 0) || amount > 10000000) return res.status(400).json({ error: 'Enter a valid withdrawal amount.' });
  if (amount > req.user.balance) return res.status(400).json({ error: 'Insufficient funds.' });
  if (!getSettings().coins.some(function (c) { return c.id === coin; })) {
    return res.status(400).json({ error: 'Unsupported cryptocurrency.' });
  }
  if (address.length < 8) return res.status(400).json({ error: 'Enter a valid wallet address.' });

  const withdrawal = {
    id: uid(),
    userId: req.user.id,
    userName: req.user.name,
    amount: amount,
    coin: coin,
    address: address,
    status: 'pending',
    createdAt: Date.now()
  };
  store.push('withdrawals', withdrawal);
  notify(req.user.id, 'withdrawal', 'Withdrawal requested', 'Your ' + coin.toUpperCase() + ' withdrawal of $' + amount.toFixed(2) + ' is awaiting approval.');
  res.status(201).json({ withdrawal: withdrawal });
});

app.get('/api/admin/withdrawals', auth.requireAdminApi, function (req, res) {
  res.json({ withdrawals: store.get('withdrawals').slice().reverse() });
});

app.patch('/api/admin/withdrawals/:id', auth.requireAdminApi, function (req, res) {
  const withdrawal = store.get('withdrawals').find(function (w) { return w.id === req.params.id; });
  if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found.' });
  if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Withdrawal was already reviewed.' });

  const status = req.body.status;
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ error: 'Invalid status.' });

  let user = null;
  if (status === 'approved') {
    user = store.get('users').find(function (u) { return u.id === withdrawal.userId; });
    if (!user) return res.status(404).json({ error: 'User no longer exists.' });
    if (user.balance < withdrawal.amount) return res.status(400).json({ error: 'User balance is insufficient for this withdrawal.' });
  }

  withdrawal.status = status;
  withdrawal.reviewedAt = Date.now();

  if (status === 'approved') {
    user.balance = round2(user.balance - withdrawal.amount);
    store.save('users');
    notify(withdrawal.userId, 'withdrawal', 'Withdrawal approved', 'Your ' + withdrawal.coin.toUpperCase() + ' withdrawal of $' + withdrawal.amount.toFixed(2) + ' was processed.');
  } else {
    notify(withdrawal.userId, 'withdrawal', 'Withdrawal rejected', 'Your ' + withdrawal.coin.toUpperCase() + ' withdrawal of $' + withdrawal.amount.toFixed(2) + ' was rejected.');
  }
  store.save('withdrawals');
  res.json({ withdrawal: withdrawal });
});

/* --------------------------- admin routes ----------------------------- */

app.get('/api/admin/users', auth.requireAdminApi, function (req, res) {
  res.json({ users: store.get('users').map(publicUser) });
});

app.patch('/api/admin/users/:id', auth.requireAdminApi, function (req, res) {
  const user = store.get('users').find(function (u) { return u.id === req.params.id; });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const body = req.body || {};
  if ('balance' in body) {
    const bal = round2(body.balance);
    if (!(bal >= 0)) return res.status(400).json({ error: 'Balance must be zero or more.' });
    user.balance = bal;
  }
  if ('kycStatus' in body) {
    if (['not_submitted', 'submitted', 'approved'].indexOf(body.kycStatus) === -1) {
      return res.status(400).json({ error: 'Invalid KYC status.' });
    }
    user.kycStatus = body.kycStatus;
  }
  if ('role' in body) {
    if (body.role !== 'user' && body.role !== 'admin') return res.status(400).json({ error: 'Invalid role.' });
    if (user.id === req.user.id && body.role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    }
    user.role = body.role;
  }
  store.save('users');
  res.json({ user: publicUser(user) });
});

// Delete a user account: removes the user, their sessions, deposits and orders.
app.delete('/api/admin/users/:id', auth.requireAdminApi, function (req, res) {
  const users = store.get('users');
  const idx = users.findIndex(function (u) { return u.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  const target = users[idx];
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (target.role === 'admin') return res.status(400).json({ error: 'You cannot delete an admin account.' });

  users.splice(idx, 1);
  store.save('users');
  auth.destroyUserSessions(target.id);
  store.update('deposits', function (arr) { return arr.filter(function (d) { return d.userId !== target.id; }); });
  store.update('orders', function (arr) { return arr.filter(function (o) { return o.userId !== target.id; }); });
  store.update('withdrawals', function (arr) { return arr.filter(function (w) { return w.userId !== target.id; }); });
  store.update('notifications', function (arr) { return arr.filter(function (n) { return n.userId !== target.id; }); });
  res.json({ ok: true });
});

// Upload profile image (base64, max 2MB)
app.post('/api/me/profile-image', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const dataUrl = String(req.body.image || '').slice(0, 5 * 1024 * 1024);
  if (!dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image.' });
  const user = req.user;
  user.profileImage = dataUrl;
  store.save('users');
  res.json({ profileImage: user.profileImage });
});

// Upload ID document images (base64 array, max 5MB each)
app.post('/api/me/id-images', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 6) : [];
  const clean = images.map(function (img) {
    return String(img || '').slice(0, 5 * 1024 * 1024);
  }).filter(function (img) { return img.startsWith('data:image/'); });
  const user = req.user;
  user.idImages = clean;
  store.save('users');
  res.json({ idImages: user.idImages });
});

// Admin: toggle user block
app.patch('/api/admin/users/:id/block', auth.requireAdminApi, function (req, res) {
  const user = store.get('users').find(function (u) { return u.id === req.params.id; });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'You cannot block an admin account.' });
  const body = req.body || {};
  const blocked = body.blocked === true;
  if (blocked && user.id === req.user.id) return res.status(400).json({ error: 'You cannot block yourself.' });
  user.blocked = blocked;
  if (blocked) auth.destroyUserSessions(user.id);
  store.save('users');
  res.json({ user: publicUser(user) });
});

app.get('/api/admin/deposits', auth.requireAdminApi, function (req, res) {
  res.json({ deposits: store.get('deposits').slice().reverse() });
});

app.patch('/api/admin/deposits/:id', auth.requireAdminApi, function (req, res) {
  const deposit = store.get('deposits').find(function (d) { return d.id === req.params.id; });
  if (!deposit) return res.status(404).json({ error: 'Deposit not found.' });
  if (deposit.status !== 'pending') return res.status(400).json({ error: 'Deposit was already reviewed.' });

  const status = req.body.status;
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ error: 'Invalid status.' });

  deposit.status = status;
  deposit.reviewedAt = Date.now();

  if (status === 'approved') {
    const user = store.get('users').find(function (u) { return u.id === deposit.userId; });
    if (user) {
      user.balance = round2(user.balance + deposit.amount);
      store.save('users');
    }
    notify(deposit.userId, 'deposit', 'Deposit approved', '$' + deposit.amount.toFixed(2) + ' in ' + deposit.coin.toUpperCase() + ' was credited to your balance.');
  } else {
    notify(deposit.userId, 'deposit', 'Deposit rejected', 'Your ' + deposit.coin.toUpperCase() + ' deposit of $' + deposit.amount.toFixed(2) + ' was rejected.');
  }
  store.save('deposits');
  res.json({ deposit: deposit });
});

app.get('/api/admin/orders', auth.requireAdminApi, function (req, res) {
  res.json({ orders: store.get('orders').slice(-200).reverse() });
});

app.put('/api/admin/settings', auth.requireAdminApi, function (req, res) {
  const addresses = (req.body && req.body.depositAddresses) || {};
  const rates = (req.body && req.body.coinRates) || {};
  const clean = { depositAddresses: {}, coinRates: {} };

  for (let i = 0; i < COINS.length; i++) {
    const id = COINS[i].id;
    if (typeof addresses[id] !== 'string' || !addresses[id].trim()) {
      return res.status(400).json({ error: 'Provide a deposit address for ' + id.toUpperCase() + '.' });
    }
    const rate = Number(rates[id]);
    if (!(rate > 0)) return res.status(400).json({ error: 'Provide a valid rate for ' + id.toUpperCase() + '.' });
    clean.depositAddresses[id] = addresses[id].trim();
    clean.coinRates[id] = rate;
  }

  store.set('settings', { siteName: DEFAULT_SETTINGS.siteName, depositAddresses: clean.depositAddresses, coinRates: clean.coinRates });
  res.json(getSettings());
});

/* --------------------------- KYC submission -------------------------- */

app.post('/api/kyc/submit', auth.requireAuthApi, function (req, res) {
  const body = req.body || {};
  const kycData = body.data || {};
  const images = Array.isArray(body.images) ? body.images : [];
  const user = req.user;

  // Basic validation
  const required = ['first_name','last_name','document_type','document_number'];
  for (let i = 0; i < required.length; i++) {
    if (!String(kycData[required[i]] || '').trim()) {
      return res.status(400).json({ error: 'Please fill all required fields.' });
    }
  }

  user.kycStatus = 'submitted';
  user.kycData = Object.assign({ submittedAt: Date.now() }, kycData);
  user.idImages = images.slice(0, 6);
  store.save('users');
  notify(user.id, 'kyc', 'KYC Submitted', 'Your identity verification is being reviewed.');
  res.json({ ok: true, kycStatus: user.kycStatus });
});

app.get('/api/kyc/status', auth.requireAuthApi, function (req, res) {
  const user = req.user;
  res.json({ kycStatus: user.kycStatus, kycData: user.kycData || null, idImages: user.idImages || [] });
});

/* ------------------------------ 404 / boot ---------------------------- */

app.use('/api', function (req, res) { res.status(404).json({ error: 'Not found' }); });

// Last line of defence: return JSON for API errors, never a stack trace or the
// Express default HTML error page.
app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const msg = status >= 500 ? 'Internal server error' : (err.message || 'Error');
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: msg });
  res.status(status).type('text/plain').send(msg);
});

// Await storage init before touching data (Postgres mode connects + hydrates
// here; JSON mode is a no-op). A broken DATABASE_URL fails the boot loudly.
store.init()
  .then(function () {
    auth.hydrateSessions();
    auth.seedAdmin();
    app.listen(PORT, function () {
      const backend = process.env.DATABASE_URL ? 'Postgres' : 'JSON files';
      console.log('[server] Tesla XTeam FX Trade running at http://localhost:' + PORT + ' (storage: ' + backend + ')');
    });
  })
  .catch(function (err) {
    console.error('[server] Failed to initialise storage: ' + err.message);
    process.exit(1);
  });
