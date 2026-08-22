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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const chatStore = require('./lib/chatStore');
const store = require('./lib/store');
const auth = require('./lib/auth');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling']
});
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
  coins: COINS,
  dashboardStats: {
    totalProfit: 0,
    bonus: 0,
    totalDeposit: 0,
    totalWithdrawal: 0
  }
};

function getSettings() {
  const s = store.get('settings');
  return {
    siteName: s.siteName || DEFAULT_SETTINGS.siteName,
    depositAddresses: Object.assign({}, DEFAULT_SETTINGS.depositAddresses, s.depositAddresses || {}),
    coinRates: Object.assign({}, DEFAULT_SETTINGS.coinRates, s.coinRates || {}),
    coins: COINS,
    dashboardStats: Object.assign({}, DEFAULT_SETTINGS.dashboardStats, s.dashboardStats || {})
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function roundCoin(n) { return Math.round((Number(n) || 0) * 1e8) / 1e8; }
// Record IDs — crypto bytes (not Math.random) so they can't be predicted.
function uid() { return crypto.randomBytes(6).toString('hex'); }

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, balance: u.balance, kycStatus: u.kycStatus, createdAt: u.createdAt, profileImage: u.profileImage, blocked: u.blocked, kycData: u.kycData || null, idImages: Array.isArray(u.idImages) ? u.idImages.slice(0, 6) : [], dashboardStats: u.dashboardStats || null };
}

/* ----------------------------- middleware ----------------------------- */

app.use(express.json({ limit: '10mb' }));
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
  if (p === '/index.html' || p === '/login.html' || p === '/signup.html' || p === '/admin-login.html' || p === '/terms.html' || p === '/privacy.html') return next();
  const user = auth.authenticate(req);
  if (!user) return res.redirect('/pages/login.html');
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
app.use('/chat-widget.js', express.static(path.join(ROOT, 'public', 'chat-widget.js')));

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

app.post('/api/admin/settings/dashboard-stats', auth.requireAdminApi, function (req, res) {
  req.body = req.body || {};
  var stats = store.get('settings').dashboardStats || {};
  var next = {};
  next.totalProfit = round2(req.body.totalProfit == null ? stats.totalProfit : Number(req.body.totalProfit));
  next.bonus = round2(req.body.bonus == null ? stats.bonus : Number(req.body.bonus));
  next.totalDeposit = round2(req.body.totalDeposit == null ? stats.totalDeposit : Number(req.body.totalDeposit));
  next.totalWithdrawal = round2(req.body.totalWithdrawal == null ? stats.totalWithdrawal : Number(req.body.totalWithdrawal));
  var s = store.get('settings');
  s.dashboardStats = next;
  store.set('settings', s);
  res.json({ ok: true, dashboardStats: next });
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

function notifyAdmins(kind, title, message) {
  const admins = store.get('users').filter(function (u) { return u.role === 'admin'; });
  admins.forEach(function (admin) {
    store.push('notifications', {
      id: uid(),
      userId: admin.id,
      kind: kind,
      title: title,
      message: message,
      read: false,
      createdAt: Date.now()
    });
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
    if (['not_submitted', 'submitted', 'approved', 'rejected'].indexOf(body.kycStatus) === -1) {
      return res.status(400).json({ error: 'Invalid KYC status.' });
    }
    user.kycStatus = body.kycStatus;
    if (body.kycStatus === 'approved') {
      notify(req.user.id, 'kyc', 'KYC Approved', 'Your identity verification was approved.');
    } else if (body.kycStatus === 'rejected') {
      user.kycData = null;
      user.idImages = [];
      user.kycStatus = 'not_submitted';
      notify(req.user.id, 'kyc', 'KYC Rejected', 'Your identity verification was rejected. Please submit again.');
    }
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

app.post('/api/admin/users/:id/clear-kyc', auth.requireAdminApi, function (req, res) {
  const user = store.get('users').find(function (u) { return u.id === req.params.id; });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.kycStatus = 'not_submitted';
  user.kycData = null;
  user.idImages = [];
  store.save('users');
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/admin/users/:id/dashboard-stats', auth.requireAdminApi, function (req, res) {
  req.body = req.body || {};
  const user = store.get('users').find(function (u) { return u.id === req.params.id; });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.dashboardStats = user.dashboardStats || {};
  if (req.body.totalProfit != null) user.dashboardStats.totalProfit = round2(Number(req.body.totalProfit));
  if (req.body.bonus != null) user.dashboardStats.bonus = round2(Number(req.body.bonus));
  store.save('users');
  res.json({ ok: true, dashboardStats: user.dashboardStats });
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

// Upload profile image + basic info (base64, max 2MB image)
app.post('/api/me/profile-image', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const dataUrl = String(req.body.image || '').slice(0, 5 * 1024 * 1024);
  if (dataUrl && !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image.' });
  const user = req.user;
  if (String(req.body.name || '').trim()) user.name = String(req.body.name).trim();
  if (String(req.body.email || '').trim()) user.email = String(req.body.email).trim();

  if (dataUrl) {
    user.profileImage = dataUrl;
    if (typeof uploadToStorage === 'function') {
      uploadToStorage('profiles/' + user.id + '/' + Date.now() + '.jpg', dataUrl)
        .then(function (url) {
          if (url) user.profileImage = url;
          store.save('users');
          res.json({ profileImage: user.profileImage });
        })
        .catch(function (err) {
          console.error('[profile] upload failed:', err.message);
          store.save('users');
          res.json({ profileImage: user.profileImage });
        });
      return;
    }
  }

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
  const deposit = (store.get('deposits') || []).find(function (d) { return d.id === req.params.id; });
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

/* ---------------------------- KYC media proxy -------------------------- */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

function buildS3Client() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) return null;
  var endpoint = process.env.S3_ENDPOINT || undefined;
  return new S3Client({
    endpoint: endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY
    },
    forcePathStyle: !!endpoint
  });
}

var s3Bucket = process.env.S3_BUCKET || '';
var s3PublicBase = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
var s3Client = buildS3Client();

function r2ObjectUrl(key) {
  if (!key) return null;
  if (s3PublicBase) return s3PublicBase + '/' + key;
  if (process.env.S3_ENDPOINT) {
    var base = String(process.env.S3_ENDPOINT).replace(/\/+$/, '');
    return base + '/' + s3Bucket + '/' + key;
  }
  return null;
}

async function uploadToStorage(key, dataUrl) {
  if (!s3Bucket || !dataUrl || !s3Client) return Promise.resolve(null);
  var match = String(dataUrl).match(/^data:([^;]+);/);
  var contentType = match ? match[1] : 'application/octet-stream';
  var body = Buffer.from(String(dataUrl).split(',')[1] || dataUrl, 'base64');
  var putCmd = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  });
  try {
    await s3Client.send(putCmd);
    return r2ObjectUrl(key);
  } catch (err) {
    throw new Error('s3-upload-failed:' + err.message);
  }
}

// Admin only: secure proxy to view/download KYC documents.
// Streams the file through Express so <img src> works, with admin auth enforced.
app.get('/api/kyc/media/:filename', auth.requireAdminApi, async function (req, res) {
  var filename = String(req.params.filename || '');
  if (!filename) return res.status(400).json({ error: 'Invalid media' });

  var users = store.get('users') || [];
  var owner = users.find(function (u) { return Array.isArray(u.idImages) && u.idImages.some(function (u2) { return String(u2).indexOf(filename) !== -1; }); });
  if (!owner) return res.status(404).json({ error: 'Not found' });

  var r2Key = 'kyc/' + filename;
  if (s3Client) {
    try {
      var cmd = new GetObjectCommand({ Bucket: s3Bucket, Key: r2Key });
      var data = await s3Client.send(cmd);
      var ct = data.ContentType || 'application/octet-stream';
      if (data.Body) {
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'no-store');
        data.Body.pipe(res);
        return;
      }
    } catch (err) {
      console.error('[kyc] proxy fetch failed:', err.message);
    }
  }

  var local = path.join(KYC_DIR, filename);
  if (!fs.existsSync(local)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(local);
});

/* --------------------------- KYC submission -------------------------- */

app.post('/api/kyc/submit', auth.requireAuthApi, async function (req, res) {
  const body = req.body || {};
  const kycData = body.data || {};
  const images = Array.isArray(body.images) ? body.images : [];
  const user = req.user;

  const required = ['first_name','last_name','document_type','document_number'];
  for (let i = 0; i < required.length; i++) {
    if (!String(kycData[required[i]] || '').trim()) {
      return res.status(400).json({ error: 'Please fill all required fields.' });
    }
  }

  user.kycStatus = 'submitted';
  user.kycData = Object.assign({ submittedAt: Date.now() }, kycData);
  var diskUrls = saveKycImagesToDisk(user.id, images.slice(0, 6));
  user.idImages = (Array.isArray(user.idImages) ? user.idImages : []).concat(diskUrls).slice(0, 6);
  store.save('users');

  var r2Urls = [];
  if (s3Bucket) {
    try { r2Urls = await uploadKycImagesToStorage(images.slice(0, 6)); } catch (e) { console.error('[kyc] r2 upload failed:', e.message); }
  }

  var allUrls = (Array.isArray(user.idImages) ? user.idImages : []).concat(r2Urls).slice(0, 6);
  user.idImages = allUrls;
  store.save('users');

  notify(user.id, 'kyc', 'KYC Submitted', 'Your identity verification is being reviewed.');
  notifyAdmins('kyc_new', 'New KYC Submission', 'User ' + (user.name || user.email) + ' submitted KYC verification.');
  res.json({ ok: true, kycStatus: user.kycStatus, idImages: user.idImages });
});

app.get('/api/kyc/status', auth.requireAuthApi, function (req, res) {
  const user = req.user;
  res.json({ kycStatus: user.kycStatus, kycData: user.kycData || null, idImages: user.idImages || [] });
});

/* --------------------------- KYC file storage ----------------------- */

const KYC_DIR = path.join(__dirname, 'data', 'kyc');

function ensureKycDir() {
  if (!fs.existsSync(KYC_DIR)) fs.mkdirSync(KYC_DIR, { recursive: true });
}
function userKycDir(userId) {
  ensureKycDir();
  const dir = path.join(KYC_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function kycFilename(userId, index, ext) {
  const ts = Date.now();
  return userId + '_' + ts + '_' + index + '.' + ext;
}
function saveKycImagesToDisk(userId, images) {
  if (!Array.isArray(images) || !images.length) return [];
  const dir = userKycDir(userId);
  const saved = [];
  images.forEach(function (src, i) {
    try {
      const match = String(src).match(/^data:(image\/[a-zA-Z0-9.+-]+);/);
      const ext = match ? match[1].split('/')[1].replace('+', '') : 'bin';
      const name = kycFilename(userId, i, ext);
      const file = path.join(dir, name);
      fs.writeFileSync(file, Buffer.from(String(src).split(',')[1] || src, 'base64'));
      saved.push('/kyc/' + userId + '/' + name);
    } catch (e) {
      console.error('[kyc] save failed:', e.message);
    }
  });
  return saved;
}

function uploadKycImagesToStorage(images) {
  if (!Array.isArray(images) || !images.length || typeof uploadToStorage !== 'function') return [];
  var results = [];
  var pending = [];
  images.forEach(function (src, i) {
    var name = kycFilename('global', i, 'jpg');
    var p = uploadToStorage('kyc/' + name, src).then(function (url) {
      if (url) results.push('/api/kyc/media/' + encodeURIComponent(name));
    }).catch(function () {});
    pending.push(p);
  });
  return Promise.all(pending).then(function () { return results; });
}

// User uploads additional KYC images.
app.post('/api/kyc/images', auth.requireAuthApi, function (req, res) {
  req.body = req.body || {};
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 6) : [];
  const clean = images.map(function (img) { return String(img || '').slice(0, 5 * 1024 * 1024); }).filter(function (img) { return img.startsWith('data:image/'); });
  const user = req.user;
  const diskUrls = saveKycImagesToDisk(user.id, clean);
  user.idImages = (Array.isArray(user.idImages) ? user.idImages : []).concat(diskUrls).slice(0, 6);
  store.save('users');
  res.json({ idImages: user.idImages });
  if (s3Bucket) {
    uploadKycImagesToStorage(clean).then(function (urls) {
      if (!urls.length) return;
      var u = store.get('users').find(function (x) { return x.id === user.id; });
      if (!u) return;
      u.idImages = (Array.isArray(u.idImages) ? u.idImages : []).concat(urls).slice(0, 6);
      store.save('users');
    }).catch(function () {});
  }
});

// Admin: list saved KYC files for a user.
app.get('/api/admin/users/:id/kyc-files', auth.requireAdminApi, function (req, res) {
  const target = store.get('users').find(function (u) { return u.id === req.params.id; });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const dir = path.join(KYC_DIR, target.id);
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { files = []; }
  const diskFiles = files.map(function (f) {
    return { name: f, url: '/api/kyc/media/' + encodeURIComponent(f) };
  });
  res.json({ files: diskFiles, diskUrls: target.idImages || [] });
});

// Serve saved KYC files from disk.
app.use('/kyc', express.static(KYC_DIR));

/* ------------------------------ 404 / boot ---------------------------- */

app.use('/api', function (req, res) { res.status(404).json({ error: 'Not found' }); });

// S3/R2/KYC storage is initialized above in the KYC media proxy section.

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
/* ----------------------- support chat socket.io ----------------------- */

// Visitor session tracking: socket.id -> { visitorKey, chatId }
const socketVisitorMap = new Map();

function getVisitorKey(socket) {
  const user = socket.user;
  if (user) return 'u:' + user.id;
  return 'v:' + (socket.handshake.auth.visitorKey || socket.id);
}

// Attach auth middleware so logged-in users get their role on socket connect.
io.use(function (socket, next) {
  const cookieHeader = socket.handshake.headers.cookie || '';
  const m = new RegExp('(?:^|;\\s*)sid=([^;]*)').exec(cookieHeader);
  if (m) {
    try {
      const rec = auth.getSession(decodeURIComponent(m[1]));
      if (rec) {
        const u = auth.findUserById(rec.userId);
        if (u && !u.blocked) socket.user = u;
      }
    } catch (e) { /* ignore */ }
  }
  next();
});

io.on('connection', function (socket) {
  const visitorKey = getVisitorKey(socket);
  const user = socket.user || null;
  const chat = chatStore.getOrCreateChat(visitorKey, user);

  socketVisitorMap.set(socket.id, { visitorKey: visitorKey, chatId: chat.id });
  socket.join('visitor:' + chat.id);

  if (user && user.role === 'admin') {
    socket.join('admin');
  }

  socket.on('chatMessage', function (data) {
    const text = String(data && data.text || '').trim();
    if (!text) return;
    const msg = chatStore.addMessage(chat.id, 'visitor', text, {
      visitorName: data.name || chat.userName,
      visitorEmail: data.email || chat.userEmail
    });
    io.to('visitor:' + chat.id).emit('chatMessage', msg);
    io.to('admin').emit('chatUpdate', { chatId: chat.id, lastMessage: msg, unread: chat.unread + 1 });
  });

  socket.on('quickReply', function (data) {
    const text = String(data && data.text || '').trim();
    if (!text) return;
    const msg = chatStore.addMessage(chat.id, 'visitor', text, {
      quickReply: true, visitorName: chat.userName, visitorEmail: chat.userEmail
    });
    io.to('visitor:' + chat.id).emit('chatMessage', msg);
    io.to('admin').emit('chatUpdate', { chatId: chat.id, lastMessage: msg, unread: chat.unread + 1 });
  });

  socket.on('joinChat', function (data) {
    if (!user || user.role !== 'admin') return;
    const chatId = data && data.chatId;
    if (!chatId) return;
    socket.join('chat:' + chatId);
    chatStore.markRead(chatId);
    io.to('visitor:' + chatId).emit('chatRead');
  });

  socket.on('agentReply', function (data) {
    if (!user || user.role !== 'admin') return;
    const chatId = data && data.chatId;
    const text = String(data && data.text || '').trim();
    if (!chatId || !text) return;
    const msg = chatStore.addMessage(chatId, 'agent', text);
    io.to('chat:' + chatId).emit('chatMessage', msg);
    io.to('visitor:' + chatId).emit('chatMessage', msg);
    io.to('visitor:' + chatId).emit('chatRead');
  });

  socket.on('loadHistory', function () {
    socket.emit('chatHistory', chat.messages || []);
  });

  socket.on('loadChat', function (data) {
    if (!user || user.role !== 'admin') return;
    const chatId = data && data.chatId;
    if (!chatId) return;
    const allChats = store.get('chats');
    const c = allChats.find(function (c2) { return c2.id === chatId; });
    if (c) socket.emit('chatHistory', c.messages || []);
  });

  socket.on('typing', function () {
    if (user && user.role === 'admin') {
      io.to('visitor:' + chat.id).emit('agentTyping');
    } else {
      socket.to('chat:' + chat.id).emit('visitorTyping');
    }
  });

  socket.on('disconnect', function () {
    socketVisitorMap.delete(socket.id);
  });
});

// HTTP API: list all chats (admin only)
app.get('/api/chat/chats', auth.requireAdminApi, function (req, res) {
  res.json({ chats: chatStore.getAllChats() });
});

app.get('/api/chat/:chatId/messages', auth.requireAdminApi, function (req, res) {
  const c = store.get('chats').find(function (c2) { return c2.id === req.params.chatId; });
  if (!c) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ messages: c.messages || [], chat: c });
});

app.get('/api/chat/visitor-key', function (req, res) {
  const user = auth.authenticate(req);
  if (user) return res.json({ visitorKey: 'u:' + user.id, name: user.name, email: user.email });
  const key = crypto.randomBytes(8).toString('hex');
  res.json({ visitorKey: 'v:' + key, name: '', email: '' });
});

store.init()
  .then(function () {
    auth.hydrateSessions();
    auth.seedAdmin();
    server.listen(PORT, function () {
      const backend = process.env.DATABASE_URL ? 'Postgres' : 'JSON files';
      console.log('[server] Tesla XTeam FX Trade running at http://localhost:' + PORT + ' (storage: ' + backend + ')');
    });
  })
  .catch(function (err) {
    console.error('[server] Failed to initialise storage: ' + err.message);
    process.exit(1);
  });
