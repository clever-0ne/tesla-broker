/*
  Tesla XTeam FX Trade — Support Chat Widget
  Floating chat bubble at bottom-right with quick-reply buttons.
  Usage: <script src="/socket.io/socket.io.js"></script><script src="/chat-widget.js"></script>
*/
(function () {
  'use strict';

  const SITE_KEY = 'xteam_support_chat_open';
  const VISITOR_KEY_STORAGE = 'chat_visitor_key';
  const QUICK_REPLIES = [
    'I have a question',
    'Deposit issue',
    'Withdrawal issue',
    'Account access'
  ];

  const SOCKET_URL = window.location.origin;
  const config = window.CHAT_CONFIG || {};
  const USE_TAWK = config.useTawk !== false;

  let socket = null;
  let currentUserId = null;

  function checkAuth() {
    return fetch("/api/me", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("login required");
        return res.json();
      })
      .then(function (data) {
        currentUserId = data.user ? data.user.id : null;
        return data;
      });
  }
  let open = localStorage.getItem(SITE_KEY) === '1';
  let visitorKey = localStorage.getItem(VISITOR_KEY_STORAGE);
  let messages = [];
  let widget, panel, badge, messagesEl, inputEl, quickRepliesEl;

  const style = document.createElement('style');
  style.textContent = `
    .xteam-chat-float { position: fixed; right: 24px; bottom: 24px; z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .xteam-chat-bubble { width: 72px; height: 72px; border-radius: 50%; background: #e82127;
      color: white; border: none; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center; font-size: 28px;
      transition: transform .2s, box-shadow .2s; margin-bottom: 4px; }
    .xteam-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 8px 26px rgba(0,0,0,.35); }
    .xteam-chat-panel { width: 380px; max-width: calc(100vw - 32px); height: 520px;
      max-height: calc(100vh - 100px); background: #fff; border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25); display: none; flex-direction: column;
      overflow: hidden; margin-bottom: 12px; border: 1px solid #e5e7eb; }
    .xteam-chat-panel.open { display: flex; }
    .xteam-chat-header { background: #1a1a2e; color: white; padding: 16px 20px;
      font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
    .xteam-chat-header img { width: 32px; height: 32px; }
    .xteam-chat-messages { flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px; }
    .xteam-msg { max-width: 80%; padding: 10px 14px; border-radius: 16px;
      font-size: 14px; line-height: 1.5; word-break: break-word; position: relative; }
    .xteam-msg.visitor { background: #f3f4f6; border-radius: 16px 16px 4px 16px; align-self: flex-end; }
    .xteam-msg.agent { background: #e82127; color: white;
      border-radius: 16px 16px 16px 4px; align-self: flex-start; }
    .xteam-msg .xteam-time { font-size: 11px; opacity: .6; margin-top: 4px; }
    .xteam-chat-input { display: flex; gap: 8px; padding: 12px; background: #f9fafb;
      border-top: 1px solid #e5e7eb; }
    .xteam-chat-input input { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db;
      border-radius: 20px; font-size: 14px; outline: none; }
    .xteam-chat-input input:focus { border-color: #e82127; }
    .xteam-chat-input button { padding: 10px 20px; background: #e82127; color: white;
      border: none; border-radius: 20px; cursor: pointer; font-size: 14px; }
    .xteam-chat-input button:disabled { opacity: .5; cursor: not-allowed; }
    .xteam-quick-replies { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
    .xteam-quick-replies button { background: #f3f4f6; border: 1px solid #e5e7eb;
      border-radius: 16px; padding: 8px 14px; font-size: 13px; cursor: pointer;
      transition: background .2s; }
    .xteam-quick-replies button:hover { background: #e5e7eb; }
    .xteam-badge { position: absolute; top: -4px; right: -4px; background: #ef4444;
      color: white; font-size: 11px; border-radius: 50%; width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center; display: none; }
    .xteam-badge.show { display: flex; }
    .xteam-typing { padding: 0 16px; font-size: 12px; color: #6b7280; height: 0;
      overflow: hidden; transition: height .2s; }
    .xteam-typing.show { height: 20px; }
  `;
  document.head.appendChild(style);

  function createUI() {
    widget = document.createElement('div');
    widget.className = 'xteam-chat-float';
    badge = document.createElement('div');
    badge.className = 'xteam-chat-badge';
    panel = document.createElement('div');
    panel.className = 'xteam-chat-panel';

    let header = document.createElement('div');
    header.className = 'xteam-chat-header';
    header.innerHTML = '<img src="/assets/tesla-logo.svg" alt="Tesla Support"><span>Support Chat</span>';
    panel.appendChild(header);

    messagesEl = document.createElement('div');
    messagesEl.className = 'xteam-chat-messages';
    panel.appendChild(messagesEl);

    let typingEl = document.createElement('div');
    typingEl.className = 'xteam-typing';
    typingEl.textContent = 'Support is typing...';
    panel.appendChild(typingEl);
    panel._typingEl = typingEl;

    quickRepliesEl = document.createElement('div');
    quickRepliesEl.className = 'xteam-quick-replies';
    QUICK_REPLIES.forEach(function (text) {
      let btn = document.createElement('button');
      btn.textContent = text;
      btn.onclick = function () { sendMessage(text); };
      quickRepliesEl.appendChild(btn);
    });
    panel.appendChild(quickRepliesEl);

    let inputArea = document.createElement('div');
    inputArea.className = 'xteam-chat-input';
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = 'Type your message...';
    inputEl.addEventListener('keypress', function (e) { if (e.key === 'Enter') sendMessage(); });
    let sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    sendBtn.onclick = function () { sendMessage(); };
    inputArea.appendChild(inputEl);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    let bubble = document.createElement('div');
    bubble.className = 'xteam-chat-bubble';
    bubble.innerHTML = '&#128461;';
    bubble.onclick = function () { togglePanel(); };
    badge.onclick = function () { togglePanel(); };

    widget.appendChild(badge);
    widget.appendChild(bubble);
    widget.appendChild(panel);
    document.body.appendChild(widget);
    setPanelOpen(open);
  }

  function setPanelOpen(isOpen) {
    open = isOpen;
    localStorage.setItem(SITE_KEY, isOpen ? '1' : '0');
    if (panel) panel.classList.toggle('open', isOpen);
    updateBadge();
  }

  function togglePanel() {
    setPanelOpen(!open);
    if (open && inputEl) setTimeout(function () { inputEl.focus(); }, 100);
  }

  function updateBadge() {
    let unread = messages.filter(function (m) { return m.role === 'visitor' && !m.read; }).length;
    if (badge) { badge.textContent = String(unread); badge.classList.toggle('show', !open && unread > 0); }
  }

  function addMessage(role, text, ts) {
    let msg = { role: role, text: text, createdAt: ts || Date.now(), read: role === 'agent' };
    messages.push(msg);
    renderMessages();
    updateBadge();
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    messages.forEach(function (m) {
      let div = document.createElement('div');
      div.className = 'xteam-msg ' + m.role;
      div.innerHTML = '<div>' + escapeHtml(m.text) + '</div><div class="xteam-time">' + formatTime(m.createdAt) + '</div>';
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    let d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  function formatTime(ts) {
    let d = new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function sendMessage(text) {
    let msg = (text !== undefined ? text : (inputEl ? inputEl.value.trim() : '')).trim();
    if (!msg) return;
    if (inputEl) inputEl.value = '';
    if (socket && socket.connected) socket.emit('chatMessage', { text: msg });
    addMessage('visitor', msg);
  }

  function initSocket() {
    if (!USE_TAWK) return;
    if (socket) socket.disconnect();
    // Only logged-in users can access support chat.
    checkAuth()
      .then(function () {
        return fetch('/api/chat/visitor-key', { credentials: 'same-origin' });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('not authenticated');
        return r.json();
      })
      .then(function (data) {
        visitorKey = data.visitorKey;
        localStorage.setItem(VISITOR_KEY_STORAGE, visitorKey);
        socket = io(SOCKET_URL, { auth: { visitorKey: visitorKey }, transports: ['websocket'] });
        socket.on('connect', function () { socket.emit('loadHistory'); });
        socket.on('chatMessage', function (data) { addMessage(data.role || 'agent', data.text, data.createdAt); });
        socket.on('chatHistory', function (msgs) {
          messages = msgs.map(function (m) { return { role: m.role, text: m.text, createdAt: m.createdAt, read: m.read }; });
          renderMessages(); updateBadge();
        });
        socket.on('agentTyping', function () {
          if (panel && panel._typingEl) panel._typingEl.classList.add('show');
          setTimeout(function () { if (panel && panel._typingEl) panel._typingEl.classList.remove('show'); }, 3000);
        });
      })
      .catch(function () { console.warn('[chat] Socket.io connect failed'); });
  }

  createUI();
  if (typeof io !== 'undefined') { initSocket(); } else { console.warn('[chat] socket.io client not loaded'); }
})();
