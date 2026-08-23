/*
  Tesla XTeam FX Trade — Admin Chat Panel JS
  Handles the real-time support chat in the admin console.
  Requires socket.io client + auth session cookie (admin role).
*/
(function () {
  'use strict';

  var socket = null;
  var activeChatId = null;
  var chats = [];

  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- Tab handling ---
  var origSetTab = window.setTab;
  window.setTab = function (name) {
    if (origSetTab) origSetTab(name);
    var panel = document.getElementById('panel-' + name);
    if (panel && !panel.classList.contains('hidden')) {
      if (name === 'chat') loadChats();
    }
  };

  function loadChats() {
    api('/api/admin/support/threads').then(function (r) {
      if (!r.ok) return;
      chats = r.data.threads || [];
      if (document.getElementById('chat-unread-summary')) {
        document.getElementById('chat-unread-summary').textContent = chats.length + ' thread' + (chats.length === 1 ? '' : 's');
      }
      renderChatList();
    });
  }

  function renderChatList() {
    var list = document.getElementById('chat-list');
    if (!list) return;
    if (!chats.length) {
      list.innerHTML = '<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No support conversations yet.</p>';
      return;
    }
    list.innerHTML = chats.map(function (c) {
      var lastMsg = c.lastMessage ? c.lastMessage.substring(0, 60) : 'No messages yet';
      var timeStr = c.lastActivity ? fmtDate(c.lastActivity) : '—';
      var unreadBadge = c.unread > 0 ? ' <span class="ml-2 inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">' + c.unread + ' new</span>' : '';
      var resolvedBadge = c.resolved ? ' <span class="ml-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Resolved</span>' : '';
      var emailLine = c.userEmail ? '<p class="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">' + esc(c.userEmail) + '</p>' : '';
      var respondBtn = ' <button type="button" onclick="event.stopPropagation(); window.adminChat.openChat(' + quote + c.threadId + quote + ')" class="shrink-0 rounded-full bg-tesla px-3 py-1 text-xs font-medium text-white transition hover:bg-tesla-600">Respond</button>';
      var clearBtn = ' <button type="button" onclick="event.stopPropagation(); window.adminChat.confirmDelete(' + quote + c.threadId + quote + ', ' + quote + esc(c.userEmail || c.threadId) + quote + ')" class="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200">Delete</button>';
      var resolveBtn = c.resolved ? '' : ' <button type="button" onclick="event.stopPropagation(); window.adminChat.confirmResolve(' + quote + c.threadId + quote + ', ' + quote + esc(c.userEmail || c.threadId) + quote + ')" class="shrink-0 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700 transition hover:bg-yellow-200">Resolve</button>';
      return '<div class="rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-white/5 mb-2' + (c.resolved ? ' opacity-75' : '') + '">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex-1 min-w-0 cursor-pointer" onclick="window.adminChat.openChat(' + quote + c.threadId + quote + ')">' +
            '<p class="text-sm font-medium text-black dark:text-white">' + esc(c.userName || 'Guest') + unreadBadge + resolvedBadge + '</p>' +
            emailLine +
            '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(lastMsg) + '</p>' +
            '<p class="text-[11px] text-slate-400">' + timeStr + '</p>' +
          '</div>' +
          '<div class="ml-2 flex items-center gap-2">' + respondBtn + resolveBtn + clearBtn + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Expose globally so inline onclick handlers work
  window.adminChat = {
    openChat: function (threadId) {
      activeChatId = threadId;
      api('/api/admin/support/messages/' + threadId).then(function (r) {
        if (!r.ok) return;
        var chat = r.data.thread || { messages: [] };
        var listView = document.getElementById('chat-list');
        if (listView) listView.classList.add('hidden');

        var quote = String.fromCharCode(39);
        var headerHtml = '<div class="flex items-center justify-between mb-3">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-lg font-medium text-black dark:text-white">' + esc(chat.userName || 'Guest') + '</p>' +
            (chat.userId ? '<p class="text-xs text-slate-500 dark:text-slate-400">ID: ' + esc(chat.userId) + '</p>' : '') +
            (chat.userEmail ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(chat.userEmail) + '</p>' : '') +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" onclick="window.adminChat.backToList()" class="rounded bg-gray-200 px-3 py-1 text-xs text-slate-900 hover:bg-gray-300">Back</button>' +
            '<button type="button" onclick="window.adminChat.confirmDelete(' + quote + threadId + quote + ', ' + quote + esc(chat.userEmail || chat.userId || 'thread') + quote + ')" class="rounded bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200">Delete Thread</button>' +
            '<button type="button" onclick="window.adminChat.confirmResolve(' + quote + threadId + quote + ', ' + quote + esc(chat.userEmail || chat.userId || 'thread') + quote + ')" class="rounded bg-yellow-100 px-3 py-1 text-xs text-yellow-700 hover:bg-yellow-200">Resolve</button>' +
          '</div>' +
        '</div>';

        var existingHeader = document.getElementById('chat-conv-header');
        if (existingHeader) existingHeader.remove();
        var headerDiv = document.createElement('div');
        headerDiv.id = 'chat-conv-header';
        headerDiv.innerHTML = headerHtml;
        convEl.insertBefore(headerDiv, convEl.firstChild);

        convEl.classList.remove('hidden');

        var msgContainer = document.getElementById('chat-messages');
        if (!msgContainer) {
          var msgsDiv = document.createElement('div');
          msgsDiv.id = 'chat-messages';
          msgsDiv.className = 'flex-1 overflow-y-auto space-y-2 mb-3';
          convEl.appendChild(msgsDiv);

          var inputArea = document.createElement('div');
          inputArea.className = 'flex gap-2';
          inputArea.innerHTML =
            '<input id="chat-reply-input" type="text" placeholder="Type your reply..." class="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black focus:border-tesla focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white">' +
            '<button onclick="window.adminChat.sendReply()" class="rounded-full bg-tesla px-4 py-2 text-xs font-medium text-white">Send</button>';
          convEl.appendChild(inputArea);
        }

        msgContainer.innerHTML = '';
        var msgs = chat.messages || [];
        msgs.forEach(function (m) {
          var div = document.createElement('div');
          div.className = 'flex ' + (m.role === 'visitor' ? 'justify-end' : 'justify-start');
          div.innerHTML = '<div class="max-w-[80%] rounded-xl px-3 py-2 text-xs ' +
            (m.role === 'visitor' ? 'bg-gray-200 text-slate-800' : 'bg-tesla text-white') + '">' +
            esc(m.text || m.messageBody || '') + '<div class="mt-1 opacity-60">' + fmtTime(m.createdAt) + '</div></div>';
          msgContainer.appendChild(div);
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;

        if (socket && socket.connected) socket.emit('joinChat', { chatId: threadId });
      });
    },

    sendReply: function () {
      var input = document.getElementById('chat-reply-input');
      var text = (input ? input.value.trim() : '');
      if (!text || !activeChatId) return;
      api('/api/admin/support/reply', { method: 'POST', body: JSON.stringify({ threadId: activeChatId, text: text }) }).then(function (r) {
        if (!r.ok) return;
        if (input) input.value = '';
        loadChats();
      });
    },

    backToList: function () {
      activeChatId = null;
      var conv = document.getElementById('chat-conversation');
      if (conv) conv.classList.add('hidden');
      var list = document.getElementById('chat-list');
      if (list) { list.classList.remove('hidden'); list.innerHTML = ''; }
      loadChats();
    },

    confirmDelete: function (threadId, label) {
      if (!confirm('Delete support thread for ' + label + '? This cannot be undone.')) return;
      fetch('/api/admin/support/thread/' + threadId, { method: 'DELETE', credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) return;
        if (activeChatId) window.adminChat.backToList();
        else loadChats();
      });
    },

    confirmResolve: function (threadId, label) {
      if (!confirm('Mark support thread for ' + label + ' as resolved? This cannot be undone.')) return;
      fetch('/api/admin/support/thread/' + threadId + '/resolve', { method: 'POST', credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) return;
        if (activeChatId) window.adminChat.backToList();
        else loadChats();
      });
    },

    closeChat: function () {
      if (activeChatId) {
        if (socket && socket.connected) socket.emit('closeChat', { chatId: activeChatId });
      }
      window.adminChat.backToList();
    },

    clearUser: function (userId) {
      if (!confirm('Clear all chat history for user ID ' + userId + '? This cannot be undone.')) return;
      var _this = this;
      fetch('/api/chat/user/' + userId, {
        method: 'DELETE',
        credentials: 'same-origin'
      }).then(function (r) {
        return r.json().catch(function () { return {}; });
      }).then(function (data) {
        if (activeChatId) { _this.backToList(); } else { loadChats(); }
      });
    }
  };

  // --- Socket.io init ---
  function initSocket() {
    if (typeof io === 'undefined') { console.warn('[admin-chat] socket.io not loaded'); return; }
    socket = io(window.location.origin, {
      transports: ['websocket'],
      auth: { token: '' }
    });
    socket.on('connect', function () { loadChats(); });
    socket.on('chatMessage', function (data) {
      if (!activeChatId || activeChatId !== (data.chatId || activeChatId)) {
        loadChats();
        return;
      }
      var msgContainer = document.getElementById('chat-messages');
      if (msgContainer) {
        var div = document.createElement('div');
        div.className = 'flex ' + (data.role === 'visitor' ? 'justify-end' : 'justify-start');
        div.innerHTML = '<div class="max-w-[80%] rounded-xl px-3 py-2 text-xs ' +
          (data.role === 'visitor' ? 'bg-gray-200 text-slate-800' : 'bg-tesla text-white') + '">' +
          esc(data.text || '') + '<div class="mt-1 opacity-60">' + fmtTime(data.createdAt || Date.now()) + '</div></div>';
        msgContainer.appendChild(div);
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
      loadChats();
    });
    socket.on('chatUpdate', function (data) { loadChats(); });
    socket.on('disconnect', function () { console.warn('[admin-chat] disconnected'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocket);
  } else {
    initSocket();
  }
})();
