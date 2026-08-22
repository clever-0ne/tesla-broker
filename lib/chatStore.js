/*
  Tesla XTeam FX Trade — support chat data layer
  Reuses the existing store (lib/store.js) for persistence.
*/
'use strict';

const store = require('./store');
const crypto = require('crypto');

function uid() { return crypto.randomBytes(6).toString('hex'); }

function getAllChats() {
  const chats = store.get('chats');
  return chats.slice().reverse();
}

function getOrCreateChat(visitorKey, user) {
  const chats = store.get('chats');
  let chat = chats.find(function (c) { return c.visitorKey === visitorKey; });
  if (!chat) {
    chat = {
      id: uid(),
      visitorKey: visitorKey,
      userId: user ? user.id : null,
      userName: user ? user.name : 'Guest',
      userEmail: user ? user.email : null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      unread: 0,
      messages: []
    };
    store.push('chats', chat);
  }
  return chat;
}

function addMessage(chatId, role, text, meta) {
  const chats = store.get('chats');
  const chat = chats.find(function (c) { return c.id === chatId; });
  if (!chat) return null;
  const msg = {
    id: uid(),
    role: role,
    text: String(text || '').slice(0, 4000),
    createdAt: Date.now(),
    read: role === 'agent'
  };
  if (meta) Object.assign(msg, meta);
  chat.messages.push(msg);
  chat.lastActivity = Date.now();
  if (role === 'visitor') chat.unread = (chat.unread || 0) + 1;
  store.save('chats');
  return msg;
}

function markRead(chatId) {
  const chats = store.get('chats');
  const chat = chats.find(function (c) { return c.id === chatId; });
  if (!chat) return;
  chat.messages.forEach(function (m) { if (m.role === 'visitor') m.read = true; });
  chat.unread = 0;
  store.save('chats');
}

function closeChat(chatId) {
  const chats = store.get('chats');
  const chat = chats.find(function (c) { return c.id === chatId; });
  if (!chat) return;
  chat.closedAt = Date.now();
  chat.open = false;
  store.save('chats');
}

// Delete a single chat by ID.
function deleteChat(chatId) {
  return store.update('chats', function (arr) {
    return arr.filter(function (c) { return c.id !== chatId; });
  });
}

// Delete all chats belonging to a specific user (by userId).
function deleteUserChats(userId) {
  return store.update('chats', function (arr) {
    return arr.filter(function (c) { return c.userId !== userId; });
  });
}

module.exports = {
  getOrCreateChat,
  getAllChats,
  addMessage,
  markRead,
  closeChat,
  deleteChat,
  deleteUserChats
};
