const fs = require('fs');
let s = fs.readFileSync('dist/admin-chat.js', 'utf8');

// Fix the mangled onclick quotes
const bad = "'<button type=\"button\" onclick=\"window.adminChat.clearUser(' + (c.userId || '') + ','' + c.id + '')\" class=\"ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200\">Clear</button>' +";
const good = "'<button type=\"button\" onclick=\"window.adminChat.clearUser(\' + (c.userId || \'\') + \',\' + c.id + \')\" class=\"ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200\">Clear</button>' +";

if (s.includes(bad)) {
  s = s.replace(bad, good);
  console.log('[OK] Fixed onclick quotes');
} else {
  // Try finding the line and replacing it
  const lines = s.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('clearUser') && lines[i].includes('ml-2 rounded')) {
      lines[i] = "          '<button type=\\"button\\" onclick=\\"window.adminChat.clearUser(' + (c.userId || '') + ',\'' + c.id + '\')\\" class=\\"ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200\\">Clear</button>' +";
      console.log('[OK] Replaced line ' + i);
      break;
    }
  }
  s = lines.join('\n');
}

fs.writeFileSync('dist/admin-chat.js', s);
