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
  // The existing setTab function already toggles panels and calls loadUsers/loadSettings.
  // We hook into it for the 'chat' tab.
  var origSetTab = window.setTab;
  window.setTab = function (name) {
    if (origSetTab) origSetTab(name);
    var panel = document.getElementById('panel-' + name);
    if (panel && !panel.classList.contains('hidden')) {
      if (name === 'chat') loadChats();
    }
  };

  function loadChats() {
    api('/api/chat/chats').then(function (r) {
      if (!r.ok) return;
      chats = r.data.chats || [];
      document.getElementById('chat-unread-summary').textContent =
        chats.length + (chats.length === 1 ? ' chat' : ' chats');
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
      var lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
      var timeStr = lastMsg ? fmtTime(lastMsg.createdAt) : fmtTime(c.lastActivity);
      var lastText = lastMsg ? esc(lastMsg.text.substring(0, 60)) : '<span class="text-slate-400">No messages yet</span>';
      var unreadBadge = c.unread > 0 ? ' <span class="ml-2 inline-block rounded-full bg-[#e82127] px-2 py-0.5 text-[10px] font-semibold text-white">' + c.unread + '</span>' : '';
      return '<div class="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-white/5" onclick="window.adminChat.openChat(\'' + c.id + '\')">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-black dark:text-white">' + esc(c.userName || 'Guest') + unreadBadge + '</p>' +
            (c.userEmail ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(c.userEmail) + '</p>' : '') +
          '</div>' +
          '<span class="text-[10px] text-slate-400 shrink-0 ml-2">' + timeStr + '</span>' +
        '</div>' +
        '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">' + lastText + '</p>' +
      '</div>';
    }).join('');
  }

  // Expose globally so inline onclick handlers work (matching the existing pattern)
  window.adminChat = {
    openChat: function (chatId) {
      activeChatId = chatId;
      var chat = chats.find(function (c) { return c.id === chatId; });
      if (!chat) return;

      // Close the list, open the conversation view
      var listView = document.getElementById('chat-list');
      if (listView) listView.classList.add('hidden');

      // Create conversation view if not exists
      var convEl = document.getElementById('chat-conversation');
      if (!convEl) {
        convEl = document.createElement('div');
        convEl.id = 'chat-conversation';
        convEl.className = 'flex-1 flex flex-col';
        convEl.innerHTML =
          '<div class="flex items-center justify-between mb-3">' +
            '<button type="button" onclick="window.adminChat.backToList()" class="inline-flex items-center text-xs font-medium text-slate-500 hover:text-black dark:text-slate-400 dark:hover:text-white">' +
              '<i data-lucide="arrow-left" class="mr-1 w-3.5 h-3.5"></i>Back to conversations' +
            '</button>' +
            '<button type="button" onclick="window.adminChat.closeChat()" class="text-xs text-slate-400 hover:text-red-500">Close</button>' +
          '</div>' +
          '<div id="chat-messages" class="flex-1 overflow-y-auto space-y-2 mb-3"></div>' +
          '<div class="flex gap-2">' +
            '<input id="chat-reply-input" type="text" placeholder="Type your reply..." class="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black focus:border-tesla focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white">' +
            '<button onclick="window.adminChat.sendReply()" class="rounded-full bg-tesla px-4 py-2 text-xs font-medium text-white">Send</button>' +
          '</div>';
        var panel = document.getElementById('panel-chat');
        if (panel) panel.appendChild(convEl);
      }

      convEl.classList.remove('hidden');
      document.getElementById('chat-messages').innerHTML = '';

      // Join the chat room and mark as read
      if (socket && socket.connected) {
        socket.emit('joinChat', { chatId: chatId });
      }

      // Render message history
      var msgs = chat.messages || [];
      var msgContainer = document.getElementById('chat-messages');
      msgs.forEach(function (m) {
        var div = document.createElement('div');
        div.className = 'flex ' + (m.role === 'visitor' ? 'justify-end' : 'justify-start');
        div.innerHTML = '<div class="max-w-[80%] rounded-xl px-3 py-2 text-xs ' +
          (m.role === 'visitor' ? 'bg-gray-200 text-slate-800' : 'bg-tesla text-white') + '">' +
          esc(m.text) + '<div class="mt-1 opacity-60">' + fmtTime(m.createdAt) + '</div></div>';
        msgContainer.appendChild(div);
      });
      msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    sendReply: function () {
      var input = document.getElementById('chat-reply-input');
      var text = (input ? input.value.trim() : '');
      if (!text || !activeChatId) return;
      if (socket && socket.connected) {
        socket.emit('agentReply', { chatId: activeChatId, text: text });
      }
      // Optimistically add the message
      var msgs = document.getElementById('chat-messages');
      if (msgs) {
        var div = document.createElement('div');
        div.className = 'flex justify-start';
        div.innerHTML = '<div class="max-w-[80%] rounded-xl px-3 py-2 text-xs bg-tesla text-white">' +
          esc(text) + '<div class="mt-1 opacity-60">' + fmtTime(Date.now()) + '</div></div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
      }
      if (input) input.value = '';
    },

    backToList: function () {
      activeChatId = null;
      var conv = document.getElementById('chat-conversation');
      if (conv) conv.remove();
      var list = document.getElementById('chat-list');
      if (list) { list.classList.remove('hidden'); list.innerHTML = ''; }
      document.getElementById('chat-unread-summary').textContent = chats.length + (chats.length === 1 ? ' chat' : ' chats');
    },

    closeChat: function () {
      if (activeChatId) {
        if (socket && socket.connected) socket.emit('closeChat', { chatId: activeChatId });
      }
      window.adminChat.backToList();
    }
  };

  // --- Socket.io init ---
  function initSocket() {
    if (typeof io === 'undefined') { console.warn('[admin-chat] socket.io not loaded'); return; }

    socket = io(window.location.origin, {
      transports: ['websocket'],
      auth: { token: '' }
    });

    socket.on('connect', function () {
      // Refresh chat list
      loadChats();
    });

    // New message arrives
    socket.on('chatMessage', function (data) {
      if (!data.chatId && activeChatId !== data.chatId) {
        // Message for a different chat — just refresh the list
        loadChats();
        return;
      }
      var msgContainer = document.getElementById('chat-messages');
      if (msgContainer && activeChatId === (data.chatId || activeChatId)) {
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

    // Live update — new chat arrived or status changed
    socket.on('chatUpdate', function (data) {
      loadChats();
    });

    socket.on('disconnect', function () {
      console.warn('[admin-chat] disconnected from server');
    });
  }

  // Initialize when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocket);
  } else {
    initSocket();
  }
})();
