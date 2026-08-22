const fs = require('fs');
let s = fs.readFileSync('public/chat-widget.js', 'utf8');

// Update initSocket to require auth check + pass user ID
const oldInit = `  function initSocket() {
    if (!USE_TAWK) return;
    if (socket) socket.disconnect();
    fetch('/api/chat/visitor-key')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        visitorKey = data.visitorKey;
        localStorage.setItem(VISITOR_KEY_STORAGE, visitorKey);
        socket = io(SOCKET_URL, { auth: { visitorKey: visitorKey }, transports: ['websocket'] });`;

const newInit = `  function initSocket() {
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
        socket = io(SOCKET_URL, { auth: { visitorKey: visitorKey }, transports: ['websocket'] });`;

if (s.includes(oldInit)) {
  s = s.replace(oldInit, newInit);
  console.log('[OK] Updated initSocket to require auth');
} else {
  console.log('[ERR] initSocket pattern not found');
}

fs.writeFileSync('public/chat-widget.js', s);
console.log('Done');
