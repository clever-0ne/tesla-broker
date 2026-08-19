/*
  Tesla XTeam FX Trade — Dashboard Shell
  --------------------------------------
  Renders the shared sidebar, top bar, mobile bottom navigation, and the
  crypto-only payment modal for every dashboard page. Include this script
  at the end of <body> on any dashboard page.

  Each page sets two attributes on <body>:
    data-page  -> key matching NAV (controls which nav item is highlighted)
    data-title -> label shown in the top bar

  Expected page skeleton:
    <body data-page="wallet" data-title="Wallet" class="...">
      <div id="app" class="min-h-screen flex">
        <div id="page-content" class="flex-1 flex flex-col min-h-screen overflow-hidden lg:ml-72">
          <main class="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:pb-6"> ... content ... </main>
        </div>
      </div>
      <script src="dashboard-shell.js"></script>
    </body>

  Pages that render charts can listen for the "themechange" event to re-theme them.
  Pages with purchase/deposit buttons call window.openPayment({ context, amount })
  to start the crypto payment process.
*/
(function () {
  'use strict';

  /* ---- Resolve this shell's directory so nav links work over http:// AND file:// ---- */
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;
  var BASE = SCRIPT_SRC ? SCRIPT_SRC.slice(0, SCRIPT_SRC.lastIndexOf('/')) : '';
  function url(path) { return BASE + path; }

  /* ---- Navigation (sidebar) ---- */
  var NAV = [
    { page: 'dashboard',          label: 'Dashboard',            icon: 'layout-dashboard', href: url('/pages/dashboard/dashboard.html') },
    { page: 'wallet',             label: 'Wallet',               icon: 'wallet',           href: url('/pages/account/wallet.html') },
    { page: 'deposit',            label: 'Deposit',              icon: 'arrow-down-to-line', href: url('/pages/deposit/deposit.html') },
    { page: 'investments',        label: 'Investments',          icon: 'trending-up',      href: url('/pages/invest/investments.html') },
    { page: 'crypto',             label: 'Crypto',               icon: 'bitcoin',          href: url('/pages/crypto/crypto.html') },
    { page: 'portfolio',          label: 'Portfolio',            icon: 'pie-chart',        href: url('/pages/account/portfolio.html') },
    { page: 'investment-dashboard', label: 'Investment Dashboard', icon: 'bar-chart-3',    href: url('/pages/invest/investment-dashboard.html') },
    { page: 'inventory',          label: 'Inventory',            icon: 'car',              href: url('/pages/vehicles/inventory.html') },
    { page: 'orders',             label: 'Orders',               icon: 'receipt',          href: url('/pages/account/orders.html') },
    { page: 'account',            label: 'Account',              icon: 'user',             href: url('/pages/account/account.html') },
    { page: 'kyc',                label: 'KYC Verification',     icon: 'shield-check',     href: url('/pages/account/kyc.html') },
    { page: 'support',            label: 'Support',              icon: 'help-circle',      href: url('/pages/support/support.html') }
  ];

  /* ---- Bottom navigation (mobile only) ---- */
  var BOTTOM_NAV = [
    { page: 'dashboard', label: 'Home',     icon: 'layout-dashboard', href: url('/pages/dashboard/dashboard.html') },
    { page: 'wallet',    label: 'Wallet',   icon: 'wallet',           href: url('/pages/account/wallet.html') },
    { page: 'investments', label: 'Invest', icon: 'trending-up',      href: url('/pages/invest/investments.html') },
    { page: 'crypto',    label: 'Crypto',   icon: 'bitcoin',          href: url('/pages/crypto/crypto.html') },
    { page: 'portfolio', label: 'Portfolio', icon: 'pie-chart',       href: url('/pages/account/portfolio.html') }
  ];

  var CURRENT = document.body.dataset.page || 'dashboard';
  var TITLE = document.body.dataset.title || 'Dashboard';

  var ACTIVE_CLS = 'flex items-center px-3 py-2.5 text-sm font-medium rounded-full bg-gray-200 text-navy-950';
  var IDLE_CLS = 'group flex items-center px-3 py-2.5 text-sm font-medium rounded-full text-gray-400 transition hover:bg-white/10 hover:text-white';

  /* ---- Sidebar markup ---- */
  function navLink(item) {
    var isActive = item.page === CURRENT;
    var cls = isActive ? ACTIVE_CLS : IDLE_CLS;
    var iconCls = isActive ? 'w-4 h-4 mr-3' : 'w-4 h-4 mr-3 text-gray-400 group-hover:text-inherit';
    var link =
      '<a href="' + item.href + '" class="' + cls + '">' +
      '<i data-lucide="' + item.icon + '" class="' + iconCls + '"></i><span>' + item.label + '</span></a>';
    if (item.page === 'support') {
      link = '<div class="pt-4 mt-4 border-t border-white/10">' + link + '</div>';
    }
    return link;
  }

  var sidebar =
    '<div id="sidebar-overlay" class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden hidden" onclick="toggleSidebar()"></div>' +
    '<aside id="sidebar" class="fixed inset-y-0 left-0 z-50 w-72 transform -translate-x-full transition-transform duration-300 ease-in-out lg:translate-x-0 bg-navy-950 border-r border-white/10">' +
      '<div class="flex flex-col h-full">' +
        '<div class="flex items-center justify-between h-16 px-6 border-b border-white/10">' +
          '<a href="' + url('/pages/index.html') + '" class="flex items-center">' +
            '<img src="' + url('/assets/logo.svg') + '" alt="Tesla XTeam FX Trade" class="h-2 w-auto filter brightness-0 invert" />' +
          '</a>' +
          '<button onclick="toggleSidebar()" class="p-1.5 rounded-full text-gray-400 transition hover:bg-white/10 lg:hidden" aria-label="Close menu">' +
            '<i data-lucide="x" class="w-4 h-4"></i>' +
          '</button>' +
        '</div>' +
        '<div class="px-6 py-4 border-b border-white/10">' +
          '<div class="flex items-center space-x-3">' +
            '<div class="flex w-12 h-12 items-center justify-center rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 shadow-sm">' +
              '<span id="sidebar-avatar-initial" class="text-sm font-medium text-navy-950">&bull;</span>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<p id="sidebar-user-name" class="text-sm font-medium text-white truncate">Loading&hellip;</p>' +
              '<p id="sidebar-user-email" class="text-xs text-gray-400 truncate">&nbsp;</p>' +
              '<div class="mt-1">' +
                '<span class="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-300">' +
                  '<i data-lucide="user" class="w-3 h-3 mr-1"></i><span id="sidebar-kyc-label">&hellip;</span>' +
                '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">' + NAV.map(navLink).join('') + '</nav>' +
        '<div class="p-4 border-t border-white/10">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-sm font-medium text-gray-300">Logout</span>' +
            '<button type="button" onclick="logout()" class="flex items-center rounded-full p-2 text-gray-300 transition hover:bg-white/10" title="Sign Out">' +
              '<i data-lucide="log-out" class="w-4 h-4"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</aside>';

  /* ---- Top bar markup ---- */
  var header =
    '<header class="sticky top-0 z-30 border-b border-white/10 bg-navy-950">' +
      '<div class="flex items-center justify-between px-4 py-2.5 sm:px-6">' +
        '<div class="flex items-center">' +
          '<button onclick="toggleSidebar()" class="mr-3 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 lg:hidden" aria-label="Open menu">' +
            '<i data-lucide="menu" class="w-5 h-5"></i>' +
          '</button>' +
          '<a href="' + url('/pages/dashboard/dashboard.html') + '" class="mr-3 flex items-center" aria-label="Tesla XTeam FX Trade">' +
            '<img src="' + url('/assets/logo.svg') + '" alt="Tesla XTeam FX Trade" class="h-2 w-auto filter brightness-0 invert" />' +
          '</a>' +
          '<div class="hidden text-lg font-medium text-white sm:block">' + TITLE + '</div>' +
        '</div>' +
        '<div class="flex items-center space-x-3">' +
          '<button type="button" id="theme-toggle" class="rounded-full p-2 text-gray-400 transition hover:bg-white/10" aria-label="Toggle dark mode">' +
            '<i data-lucide="sun" id="theme-sun" class="w-5 h-5 hidden"></i>' +
            '<i data-lucide="moon" id="theme-moon" class="w-5 h-5"></i>' +
          '</button>' +
          '<div class="relative">' +
            '<button onclick="toggleNotifications()" class="relative rounded-full p-2 text-gray-400 transition hover:bg-white/10" aria-label="Notifications">' +
              '<i data-lucide="bell" class="w-5 h-5"></i>' +
              '<span id="notification-badge" class="absolute -top-0.5 -right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-xs text-navy-950">0</span>' +
            '</button>' +
            '<div id="notifications-dropdown" class="absolute right-0 z-50 mt-2 hidden w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-900">' +
              '<div class="border-b border-gray-200 p-3 dark:border-white/10">' +
                '<h3 class="text-sm font-medium text-black dark:text-white">Notifications</h3>' +
              '</div>' +
              '<div id="notifications-list" class="max-h-64 overflow-y-auto">' +
                '<div class="p-3 text-center">' +
                  '<div class="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">' +
                    '<i data-lucide="bell" class="w-3 h-3 text-gray-400"></i>' +
                  '</div>' +
                  '<p class="text-xs text-gray-500 dark:text-gray-400">No notifications</p>' +
                '</div>' +
              '</div>' +
              '<div class="border-t border-gray-200 p-3 dark:border-white/10">' +
                '<button type="button" onclick="markNotificationsRead()" class="text-xs font-medium text-tesla hover:underline">Mark all as read</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" onclick="logout()" class="rounded-full p-2 text-gray-400 transition hover:bg-white/10 lg:hidden" aria-label="Sign out">' +
            '<i data-lucide="log-out" class="w-5 h-5"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</header>';

  /* ---- Mobile bottom nav markup ---- */
  function bottomItem(item) {
    if (item.page === CURRENT) {
      return '<a href="' + item.href + '" class="flex flex-col items-center rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 px-3 py-1.5 text-navy-950">' +
        '<div class="relative"><i data-lucide="' + item.icon + '" class="mb-1 w-5 h-5"></i><div class="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-navy-950"></div></div>' +
        '<span class="text-xs font-semibold">' + item.label + '</span></a>';
    }
    return '<a href="' + item.href + '" class="flex flex-col items-center rounded-xl px-3 py-1.5 text-gray-400 transition hover:bg-white/10">' +
      '<i data-lucide="' + item.icon + '" class="mb-1 w-5 h-5"></i><span class="text-xs font-semibold">' + item.label + '</span></a>';
  }

  var bottomNav =
    '<div class="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-navy-950 shadow-2xl lg:hidden">' +
      '<div class="flex justify-around px-3 py-2">' + BOTTOM_NAV.map(bottomItem).join('') + '</div>' +
    '</div>';

  /* ================= Crypto Payment Modal =================
     Every deposit / order / investment flows through here.
     All deposits are processed in cryptocurrency only.       */
  var PAYMENT_COINS = [
    { id: 'btc',  name: 'Bitcoin',  symbol: 'BTC',  network: 'BTC network',  icon: url('/assets/coins/btc.png'),  rate: 67420.15, address: 'bc1qxtfxtrdepplaceholderaddress0001' },
    { id: 'eth',  name: 'Ethereum', symbol: 'ETH',  network: 'ERC-20',       icon: url('/assets/coins/eth.png'),  rate: 3510.80,  address: '0x8F3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
    { id: 'usdt', name: 'Tether',   symbol: 'USDT', network: 'TRC-20',       icon: url('/assets/coins/usdt.png'), rate: 1.0,      address: 'TXTeamFXTradeDepositPlaceholderAddress001' },
    { id: 'sol',  name: 'Solana',   symbol: 'SOL',  network: 'Solana',       icon: url('/assets/coins/sol.png'),  rate: 172.35,   address: 'XTeamFXTradeSolanaDepositPlaceholderAddress0001' }
  ];

  // Admin-configured addresses/rates replace the defaults after /api/settings.
  function applySettings(s) {
    if (!s || !s.coins || !s.coinRates || !s.depositAddresses) return;
    PAYMENT_COINS = s.coins.map(function (c) {
      return {
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        network: c.network,
        icon: url('/assets/coins/' + c.id + '.png'),
        rate: Number(s.coinRates[c.id]) || 1,
        address: s.depositAddresses[c.id] || ''
      };
    });
  }

  var paymentModalHtml =
    '<div id="payment-modal" class="fixed inset-0 z-[100] hidden items-center justify-center p-4">' +
      '<div class="absolute inset-0 bg-black/70" onclick="closePayment()"></div>' +
      '<div class="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-900">' +
        '<div class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">' +
          '<div>' +
            '<h3 id="payment-title" class="text-base font-medium text-black dark:text-white">Deposit</h3>' +
            '<p id="payment-subtitle" class="text-xs text-gray-500 dark:text-gray-400">All deposits are made in cryptocurrency</p>' +
          '</div>' +
          '<button type="button" onclick="closePayment()" class="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10" aria-label="Close">' +
            '<i data-lucide="x" class="w-4 h-4"></i>' +
          '</button>' +
        '</div>' +
        '<div id="payment-body" class="p-5"></div>' +
      '</div>' +
    '</div>';

  var paymentState = { step: 'select', coin: null, amount: 0, context: 'Deposit', effect: null };

  function fmtMoney(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtCoin(n) {
    if (n >= 1000) return Number(n).toFixed(2);
    if (n >= 1) return Number(n).toFixed(4);
    return Number(n).toFixed(8);
  }

  /* ================= Shared Fiat Balance =================
     Single source of truth for the account balance, served by the
     backend. Deposits credit it (after admin approval); purchases and
     orders debit it immediately. Every page reads it through
     window.FX.balance() (cached) and re-renders on "fxbalancechange". */

  var ME = null;          // current logged-in user (from /api/me)
  var BALANCE_CACHE = 0;  // server-backed balance, kept in memory

  // Small fetch wrapper: resolves to { ok, status, data }.
  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function setBalance(value) {
    BALANCE_CACHE = Math.round((Number(value) || 0) * 100) / 100;
    window.dispatchEvent(new CustomEvent('fxbalancechange', { detail: BALANCE_CACHE }));
  }

  window.FX = {
    balance: function () { return BALANCE_CACHE; },
    user: function () { return ME; },
    // Re-fetch the current user + balance from the backend.
    refresh: function () {
      return api('/api/me').then(function (r) {
        if (!r.ok) { setBalance(0); return false; }
        ME = r.data.user;
        // Admins can browse the customer frontend too; the console stays
        // gated to admins by the server, so both areas work from one session.
        setBalance(ME.balance);
        applyUserToSidebar();
        return true;
      });
    },
    // Record a purchase/order — debits the balance server-side.
    debit: function (amount, type, item) {
      return api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ type: type || 'order', item: item || 'Purchase', amount: Number(amount) || 0 })
      }).then(function (r) {
        if (r.ok) setBalance(r.data.balance);
        return r;
      });
    },
    // Submit a crypto deposit — pending until admin approval.
    credit: function (amount, coin, txid) {
      return api('/api/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) || 0, coin: coin || 'btc', txid: txid || '' })
      });
    }
  };

  // Any element with a data-balance attribute shows the live fiat balance.
  function renderBalances() {
    var value = FX.balance();
    var els = document.querySelectorAll('[data-balance]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = '$' + fmtMoney(value);
    }
  }
  window.addEventListener('fxbalancechange', renderBalances);
  document.addEventListener('DOMContentLoaded', renderBalances);

  function renderPaymentStep(step) {
    var body = document.getElementById('payment-body');
    if (!body) return;
    paymentState.step = step;
    var c = paymentState.coin ? PAYMENT_COINS.filter(function (x) { return x.id === paymentState.coin; })[0] : null;
    var html = '';

    if (step === 'select') {
      var contextNote = paymentState.amount > 0
        ? '<p class="text-xs text-gray-500 dark:text-gray-400">Amount: <span class="font-medium text-gray-700 dark:text-gray-300">$' + fmtMoney(paymentState.amount) + '</span></p>'
        : '';
      html =
        '<div class="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">' +
          '<p class="text-xs text-gray-500 dark:text-gray-400">Paying for</p>' +
          '<p class="text-sm font-medium text-black dark:text-white">' + paymentState.context + '</p>' + contextNote +
        '</div>' +
        '<p class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Choose a cryptocurrency</p>' +
        '<div class="mb-4 grid grid-cols-2 gap-2">' +
        PAYMENT_COINS.map(function (coin) {
          var active = paymentState.coin === coin.id;
          return '<button type="button" onclick="selectPaymentCoin(\'' + coin.id + '\')" class="rounded-xl border p-3 text-left transition ' +
            (active ? 'border-tesla bg-tesla/5 shadow-sm shadow-tesla/20' : 'border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20') + '">' +
            '<div class="flex items-center space-x-2">' +
              '<img src="' + coin.icon + '" alt="' + coin.name + '" class="h-7 w-7 rounded-full" />' +
              '<div><p class="text-sm font-medium text-black dark:text-white">' + coin.symbol + '</p>' +
              '<p class="text-xs text-gray-500 dark:text-gray-400">' + coin.network + '</p></div>' +
            '</div></button>';
        }).join('') +
        '</div>' +
        (paymentState.amount > 0
          ? ''
          : '<label for="payment-amount-input" class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Amount (USD)</label>' +
            '<input id="payment-amount-input" type="number" min="1" placeholder="0.00" oninput="setPaymentAmount(this.value)" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-black focus:border-tesla focus:outline-none dark:border-white/10 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500" />' +
            '<div class="mt-2 mb-4 flex gap-2">' +
              [100, 500, 1000].map(function (v) {
                return '<button type="button" onclick="setPaymentAmount(' + v + ')" class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20">$' + v + '</button>';
              }).join('') +
            '</div>') +
        '<button type="button" onclick="continuePayment()" class="w-full rounded-full bg-tesla py-2.5 text-sm font-medium text-white dark:text-black transition hover:bg-tesla-600">Continue</button>' +
        '<p class="mt-3 text-center text-[11px] text-gray-400 dark:text-gray-500">Deposits are only processed in cryptocurrency. No fiat payment methods.</p>';

    } else if (step === 'pay' && c) {
      var coinAmount = paymentState.amount / c.rate;
      html =
        '<div class="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">' +
          '<div class="flex items-center justify-between">' +
            '<p class="text-xs text-gray-500 dark:text-gray-400">' + paymentState.context + '</p>' +
            '<p class="text-sm font-medium text-black dark:text-white">$' + fmtMoney(paymentState.amount) + '</p>' +
          '</div>' +
          '<div class="mt-1 flex items-center justify-between">' +
            '<p class="text-xs text-gray-500 dark:text-gray-400">Send</p>' +
            '<p class="text-xs font-medium text-gray-700 dark:text-gray-300">' + fmtCoin(coinAmount) + ' ' + c.symbol + ' <span class="text-gray-400">(est.)</span></p>' +
          '</div>' +
        '</div>' +
        '<p class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Deposit address — ' + c.name + ' (' + c.network + ')</p>' +
        '<div class="mb-3 flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 dark:border-white/20">' +
          '<span id="payment-address" class="truncate font-mono text-xs text-gray-600 dark:text-gray-400">' + c.address + '</span>' +
          '<button type="button" onclick="copyPaymentAddress()" class="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20">' +
            '<i data-lucide="copy" class="mr-1 inline h-3 w-3"></i>Copy</button>' +
        '</div>' +
        '<div class="mb-4 flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50 py-6 dark:border-white/10 dark:bg-white/5">' +
          '<div class="text-center">' +
            '<img src="' + c.icon + '" alt="' + c.name + '" class="mx-auto mb-2 h-14 w-14 rounded-2xl" />' +
            '<p class="text-xs text-gray-400">QR code placeholder</p>' +
            '<p class="text-[11px] text-gray-400">(generated by the backend)</p>' +
          '</div>' +
        '</div>' +
        '<div class="mb-4 rounded-xl border border-tesla/20 bg-tesla/5 p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">' +
          'Send only <span class="font-medium text-tesla">' + c.symbol + '</span> on the <span class="font-medium text-tesla">' + c.network + '</span> network to this address. Sending any other asset may result in permanent loss.' +
        '</div>' +
        '<button type="button" onclick="confirmPaymentSent()" class="w-full rounded-full bg-tesla py-2.5 text-sm font-medium text-white dark:text-black transition hover:bg-tesla-600">I’ve sent the payment</button>' +
        '<button type="button" onclick="renderPaymentStep(\'select\')" class="mt-2 w-full rounded-full bg-gray-100 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20">Back</button>';

    } else {
      // pending — wording depends on whether this was a deposit or a purchase
      var pendingTitle, pendingMsg;
      if (paymentState.effect === 'debit') {
        pendingTitle = 'Payment received';
        pendingMsg = 'Your purchase was completed successfully.<br />Your updated balance appears below.';
      } else if (paymentState.effect === 'credit') {
        pendingTitle = 'Deposit submitted';
        pendingMsg = 'Your deposit is awaiting approval.<br />Once approved, the amount will be added to your balance.';
      } else {
        pendingTitle = 'Payment pending';
        pendingMsg = 'Waiting for blockchain confirmation.<br />Your ' + paymentState.context + ' will be processed automatically once confirmed.';
      }
      html =
        '<div class="py-8 text-center">' +
          '<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tesla/10">' +
            '<i data-lucide="check" class="w-7 h-7 text-tesla"></i>' +
          '</div>' +
          '<h4 class="mb-1 text-base font-medium text-black dark:text-white">' + pendingTitle + '</h4>' +
          '<p class="mb-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">' + pendingMsg + '</p>' +
          '<button type="button" onclick="closePayment()" class="w-full rounded-full bg-navy-900 py-2.5 text-sm font-medium text-white transition hover:bg-navy-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">Close</button>' +
        '</div>';
    }

    body.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  /* ---- Payment API (used by every dashboard page) ---- */
  window.openPayment = function (config) {
    config = config || {};
    paymentState.context = config.context || 'Deposit';
    paymentState.amount = Number(config.amount) || 0;
    paymentState.coin = config.coin || null;
    paymentState.effect = config.effect || null; // 'credit' (deposit) | 'debit' (purchase/order)
    paymentState.type = config.type || null;     // order type: vehicle | investment | crypto | order
    document.getElementById('payment-title').textContent = config.title || 'Deposit';
    // 'pay' skips coin selection and goes straight to the wallet address.
    renderPaymentStep(config.step === 'pay' && paymentState.coin ? 'pay' : 'select');
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('payment-modal').classList.add('flex');
  };

  window.closePayment = function () {
    var modal = document.getElementById('payment-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  window.selectPaymentCoin = function (id) {
    paymentState.coin = id;
    renderPaymentStep('select');
  };

  window.setPaymentAmount = function (value) {
    paymentState.amount = Math.max(0, parseFloat(value) || 0);
  };

  window.continuePayment = function () {
    if (!paymentState.coin) {
      alert('Please choose a cryptocurrency first.');
      return;
    }
    if (paymentState.amount < 1) {
      alert('Please enter a valid amount (minimum $1).');
      return;
    }
    renderPaymentStep('pay');
  };

  // Map a payment context ("Buy Investment", "Vehicle Purchase", …) to an order type.
  function guessOrderType(context) {
    var c = String(context || '').toLowerCase();
    if (c.indexOf('invest') !== -1) return 'investment';
    if (c.indexOf('crypto') !== -1 || c.indexOf('coin') !== -1) return 'crypto';
    if (c.indexOf('vehicle') !== -1 || c.indexOf('car') !== -1) return 'vehicle';
    return 'order';
  }

  window.confirmPaymentSent = function () {
    if (paymentState.effect === 'debit') {
      FX.debit(paymentState.amount, paymentState.type || guessOrderType(paymentState.context), paymentState.context).then(function (r) {
        if (r.ok) {
          renderPaymentStep('pending');
        } else {
          alert(r.data.error || 'Unable to complete your purchase.');
          closePayment();
        }
      });
    } else if (paymentState.effect === 'credit') {
      FX.credit(paymentState.amount, paymentState.coin).then(function (r) {
        if (r.ok) {
          renderPaymentStep('pending');
        } else {
          alert(r.data.error || 'Unable to submit your deposit.');
          closePayment();
        }
      });
    } else {
      renderPaymentStep('pending');
    }
  };

  window.copyPaymentAddress = function () {
    var c = PAYMENT_COINS.filter(function (x) { return x.id === paymentState.coin; })[0];
    if (!c) return;
    var done = function () {
      var btn = document.querySelector('#payment-body button[onclick="copyPaymentAddress()"]');
      if (btn) {
        var old = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        setTimeout(function () { btn.innerHTML = old; }, 1500);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(c.address).then(done, done);
    } else {
      done();
    }
  };

  /* ---- Inject into the page ---- */
  var app = document.getElementById('app');
  var content = document.getElementById('page-content');
  if (app) app.insertAdjacentHTML('afterbegin', sidebar);
  if (content) content.insertAdjacentHTML('afterbegin', header);
  document.body.insertAdjacentHTML('beforeend', bottomNav);
  document.body.insertAdjacentHTML('beforeend', paymentModalHtml);

  /* ---- Fixed page background (grid lines) shared by every dashboard page ---- */
  document.body.insertAdjacentHTML('beforeend',
    '<div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 t-gridlines"></div>');


  /* ---- Theme ---- */
  function getInitialTheme() {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'light';
  }

  function updateThemeIcon(theme) {
    var sun = document.getElementById('theme-sun');
    var moon = document.getElementById('theme-moon');
    if (!sun || !moon) return;
    if (theme === 'dark') { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    else { moon.classList.remove('hidden'); sun.classList.add('hidden'); }
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    updateThemeIcon(theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }

  window.getCurrentTheme = function () {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  };

  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var isDark = document.documentElement.classList.contains('dark');
      var next = isDark ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
    });
  }

  /* ---- Sidebar toggle ---- */
  window.toggleSidebar = function () {
    var sidebarEl = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (!sidebarEl) return;
    var isOpen = sidebarEl.classList.contains('translate-x-0');
    if (isOpen) {
      sidebarEl.classList.remove('translate-x-0');
      sidebarEl.classList.add('-translate-x-full');
      if (overlay) overlay.classList.add('hidden');
    } else {
      sidebarEl.classList.remove('-translate-x-full');
      sidebarEl.classList.add('translate-x-0');
      if (overlay) overlay.classList.remove('hidden');
    }
  };

  /* ---- Notifications ---- */
  var notifications = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function timeAgo(ts) {
    var diff = Date.now() - (Number(ts) || 0);
    if (diff < 60000) return 'just now';
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function notificationKindIcon(kind) {
    if (kind === 'deposit') return 'arrow-down-to-line';
    if (kind === 'withdrawal') return 'arrow-up-from-line';
    if (kind === 'order') return 'receipt';
    return 'bell';
  }

  function renderNotifications() {
    var list = document.getElementById('notifications-list');
    var badge = document.getElementById('notification-badge');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML =
        '<div class="p-3 text-center">' +
          '<div class="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">' +
            '<i data-lucide="bell" class="w-3 h-3 text-gray-400"></i>' +
          '</div>' +
          '<p class="text-xs text-gray-500 dark:text-gray-400">No notifications</p>' +
        '</div>';
    } else {
      list.innerHTML = notifications.slice(0, 20).map(function (n) {
        var unreadCls = n.read ? 'bg-gray-100 dark:bg-white/10' : 'bg-[#e9f0fc] dark:bg-[#2563eb]/15';
        var iconCls = n.read ? 'text-gray-400' : 'text-[#2563eb]';
        return '<div class="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-white/5">' +
          '<div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + unreadCls + '">' +
            '<i data-lucide="' + notificationKindIcon(n.kind) + '" class="w-3.5 h-3.5 ' + iconCls + '"></i>' +
          '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<p class="text-xs font-medium text-black dark:text-white">' + esc(n.title) + (n.read ? '' : '<span class="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#2563eb]"></span>') + '</p>' +
            '<p class="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">' + esc(n.message) + '</p>' +
            '<p class="mt-1 text-[10px] text-gray-400 dark:text-gray-500">' + timeAgo(n.createdAt) + '</p>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var unread = notifications.filter(function (n) { return !n.read; }).length;
    if (badge) {
      badge.classList.toggle('hidden', unread === 0);
      badge.textContent = unread > 99 ? '99+' : String(unread);
    }
    if (window.lucide) lucide.createIcons();
  }

  window.loadNotifications = function () {
    return api('/api/notifications').then(function (r) {
      if (!r.ok) return;
      notifications = r.data.notifications || [];
      renderNotifications();
    });
  };

  window.markNotificationsRead = function () {
    api('/api/notifications/read', { method: 'POST' }).then(function () {
      notifications.forEach(function (n) { n.read = true; });
      renderNotifications();
    });
  };

  window.toggleNotifications = function () {
    var dropdown = document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    var opening = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    if (opening) {
      window.loadNotifications().then(window.markNotificationsRead);
    }
  };
  document.addEventListener('click', function (event) {
    var dropdown = document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    if (event.target.closest('#notifications-dropdown')) return;
    if (event.target.closest('[onclick="toggleNotifications()"]')) return;
    dropdown.classList.add('hidden');
  });

  /* ================= Auth bootstrap =================
     Every dashboard page requires a valid session. On load we ask the
     backend who we are; a 401 bounces to the login page. We also pull
     the admin-configured crypto addresses/rates for the payment modal. */

  function applyUserToSidebar() {
    if (!ME) return;
    var n = document.getElementById('sidebar-user-name');
    var e = document.getElementById('sidebar-user-email');
    var k = document.getElementById('sidebar-kyc-label');
    var a = document.getElementById('sidebar-avatar-initial');
    if (n) n.textContent = ME.name || 'Account';
    if (e) e.textContent = ME.email || '';
    if (a) a.textContent = (ME.name || '?').charAt(0).toUpperCase();
    var label = 'KYC Not Submitted';
    if (ME.kycStatus === 'submitted') label = 'KYC Pending';
    if (ME.kycStatus === 'approved') label = 'KYC Approved';
    if (k) k.textContent = label;
  }

  window.logout = function () {
    api('/api/auth/logout', { method: 'POST' }).then(function () {
      window.location.href = url('/pages/index.html#auth');
    }, function () {
      window.location.href = url('/pages/index.html#auth');
    });
  };

  // Load the admin-configured payment settings (addresses + rates).
  api('/api/settings').then(function (r) { if (r.ok) applySettings(r.data); });

  // Resolve the session; no valid session means we must log in first.
  FX.refresh().then(function (ok) {
    if (!ok) window.location.href = url('/pages/index.html#auth');
    else window.loadNotifications();
  });

  /* ---- Lucide icons (runs twice safely; only <i data-lucide> are converted) ---- */
  if (window.lucide) lucide.createIcons();
  document.addEventListener('DOMContentLoaded', function () {
    if (window.lucide) lucide.createIcons();
  });

  /* ---- Pull-to-refresh (touch only): drag down from the top to reload ---- */
  (function () {
    // Only touch-capable devices get the gesture; desktop/trackpad is untouched.
    if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;

    var THRESHOLD = 70;      // px of pull that triggers a reload
    var MAX_PULL = 110;      // cap on how far the bar follows the finger
    var BAR_HEIGHT = 46;
    var bar = null, started = false, pulling = false, startY = 0, dist = 0;

    // Styles for the glossy navy pull bar (no blur, matches the design system).
    var style = document.createElement('style');
    style.textContent =
      '#ptr-bar{' +
        'position:fixed;top:0;left:0;right:0;height:' + BAR_HEIGHT + 'px;' +
        'display:flex;align-items:center;justify-content:center;gap:8px;' +
        'background:linear-gradient(180deg,#16283f,#0d1b2e);' +
        'border-bottom:1px solid #2b4a6f;box-shadow:0 2px 10px rgba(0,0,0,.35);' +
        'color:#e8eef6;font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;' +
        'letter-spacing:.02em;transform:translate3d(0,-' + BAR_HEIGHT + 'px,0);' +
        'transition:transform .28s cubic-bezier(.2,.7,.2,1);' +
        'z-index:9999;pointer-events:none;user-select:none;-webkit-user-select:none;' +
      '}' +
      '#ptr-bar .ptr-ico{color:#7dd3fc;font-size:15px;line-height:1;transition:transform .2s ease;}' +
      '#ptr-bar .ptr-spin{animation:ptr-spin .7s linear infinite;}' +
      '@keyframes ptr-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(style);

    function makeBar() {
      var b = document.createElement('div');
      b.id = 'ptr-bar';
      b.innerHTML = '<span class="ptr-ico">&#x2193;</span><span class="ptr-txt">Pull to refresh</span>';
      document.body.appendChild(b);
      return b;
    }

    function setBar(y, msg, ready) {
      if (!bar) bar = makeBar();
      bar.querySelector('.ptr-txt').textContent = msg;
      var ico = bar.querySelector('.ptr-ico');
      ico.style.transform = ready ? 'rotate(180deg)' : 'rotate(0deg)';
      bar.style.transform = 'translate3d(0,' + y + 'px,0)';
    }

    function endPull() {
      pulling = false; started = false;
      if (!bar) return;
      bar.style.transition = '';
      setBar(-BAR_HEIGHT, 'Pull to refresh', false);
    }

    function reload() {
      pulling = false; started = false;
      if (!bar) return;
      bar.style.transition = '';
      var ico = bar.querySelector('.ptr-ico');
      ico.className = 'ptr-ico ptr-spin';
      setBar(8, 'Refreshing…', false);
      setTimeout(function () { window.location.reload(); }, 350);
    }

    document.addEventListener('touchstart', function (e) {
      if (pulling || window.scrollY > 0) { started = false; return; }
      startY = e.touches[0].clientY;
      started = true;
    }, { passive: true });

    // passive:false so preventDefault() stops the native browser pull-to-refresh
    // while our own gesture owns the touch.
    document.addEventListener('touchmove', function (e) {
      if (!started) return;
      var dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) { if (pulling) endPull(); return; }
      if (!pulling) {
        pulling = true;
        if (bar) bar.style.transition = 'none'; // follow the finger, no easing
      }
      e.preventDefault();
      dist = Math.min(MAX_PULL, dy * 0.45);
      var ready = dist >= THRESHOLD;
      setBar(dist - BAR_HEIGHT, ready ? 'Release to refresh' : 'Pull to refresh', ready);
    }, { passive: false });

    document.addEventListener('touchend', function () {
      if (!started) { return; }
      started = false;
      if (!pulling) return;
      if (dist >= THRESHOLD) reload();
      else endPull();
    });

    document.addEventListener('touchcancel', function () { if (pulling) endPull(); });
  })();
})();
