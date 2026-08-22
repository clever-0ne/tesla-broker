const fs = require('fs');
let s = fs.readFileSync('dist/admin-chat.js', 'utf8');

// 1. Add userId display in the chat list rendering
const oldRender = `      return '<div class="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-white/5" onclick="window.adminChat.openChat(\'' + c.id + '\')">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-black dark:text-white">' + esc(c.userName || 'Guest') + unreadBadge + '</p>' +
            (c.userEmail ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(c.userEmail) + '</p>' : '') +
          '</div>' +` ;

const newRender = `      var clearBtn = '<button type="button" onclick="window.adminChat.clearUser(\'' + (c.userId || '') + '\',\'' + c.id + '\')" class="ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200">Clear</button>';
      return '<div class="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-white/5" onclick="window.adminChat.openChat(\'' + c.id + '\')">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-black dark:text-white">' + esc(c.userName || 'Guest') + unreadBadge + '</p>' +
            (c.userId ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">ID: ' + esc(c.userId) + '</p>' : '') +
            (c.userEmail ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(c.userEmail) + '</p>' : '') +
          '</div>' + clearBtn +` ;

if (s.includes(oldRender)) {
  s = s.replace(oldRender, newRender);
  console.log('[OK] Added userId display + Clear button in chat list');
} else {
  console.log('[ERR] Chat list render pattern not found');
}

// 2. Add clearUser method to adminChat
const oldClose = `    closeChat: function () {
      if (activeChatId) {
        if (socket && socket.connected) socket.emit('closeChat', { chatId: activeChatId });
      }
      window.adminChat.backToList();
    }`;

const newClose = `    closeChat: function () {
      if (activeChatId) {
        if (socket && socket.connected) socket.emit('closeChat', { chatId: activeChatId });
      }
      window.adminChat.backToList();
    },

    clearUser: function (userId, chatId) {
      if (!confirm('Clear all chat history for this user? This cannot be undone.')) return;
      fetch('/api/chat/user/' + userId, {
        method: 'DELETE',
        credentials: 'same-origin'
      }).then(function (r) {
        return r.json().catch(function () { return {}; });
      }).then(function (data) {
        // Remove from list and close if open
        if (chatId === activeChatId) window.adminChat.backToList();
        loadChats();
      });
    }`;

if (s.includes(oldClose)) {
  s = s.replace(oldClose, newClose);
  console.log('[OK] Added clearUser method');
} else {
  console.log('[ERR] closeChat pattern not found');
}

fs.writeFileSync('dist/admin-chat.js', s);
console.log('Done');
