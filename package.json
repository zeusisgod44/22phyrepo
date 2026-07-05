// 22phy oda senkron sunucusu + arkadaşlık sistemi.
// Oda senkronu, güncelleme dağıtımı ve basit bir arkadaşlık/durum
// sistemi (arkadaşlık isteği, bildirim, arkadaş listesi, "ne dinliyor")
// hepsi burada. Tüm veri bellekte tutuluyor - sunucu yeniden başlarsa
// (deploy güncellemesi vb.) sıfırlanır. Kalıcı bir veritabanı değil.

const http = require('http');
const fs = require('fs');
const path = require('path');

const rooms = new Map();          // roomCode -> { json: string, updatedAt: number }
const users = new Map();          // friendId -> { nickname, avatar, lastSeenMs, nowPlaying, lastPlayed }
const friendRequests = new Map(); // toId -> Set<fromId>
const friendships = new Map();    // id -> Set<friendId>
const roomInvites = new Map();    // toId -> [{ fromId, roomCode, ts }]

const ONLINE_TIMEOUT_MS = 40 * 1000;
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function send(res, status, body, extraHeaders) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }, extraHeaders || {}));
  res.end(body);
}

function readJsonBody(req, maxLen, cb) {
  let body = '';
  let tooBig = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > maxLen) { tooBig = true; req.destroy(); }
  });
  req.on('end', () => {
    if (tooBig) return cb(new Error('too big'), null);
    try { cb(null, body.length ? JSON.parse(body) : {}); }
    catch (e) { cb(e, null); }
  });
}

function tryServeStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/latest\//, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

  const ext = path.extname(filePath);
  const contentType = ext === '.zip' ? 'application/zip'
    : ext === '.json' ? 'application/json'
    : 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function ensureUser(id) {
  if (!users.has(id)) {
    users.set(id, { nickname: id, avatar: null, lastSeenMs: 0, nowPlaying: null, lastPlayed: null });
  }
  return users.get(id);
}

function publicUserView(id) {
  const u = users.get(id);
  if (!u) return { id, nickname: id, avatar: null, online: false, nowPlaying: null, lastPlayed: null };
  const online = (Date.now() - u.lastSeenMs) < ONLINE_TIMEOUT_MS;
  return {
    id,
    nickname: u.nickname,
    avatar: u.avatar,
    online,
    nowPlaying: online ? u.nowPlaying : null,
    lastPlayed: u.lastPlayed
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/') {
    return send(res, 200, JSON.stringify({ ok: true, rooms: rooms.size, users: users.size, uptimeSec: Math.floor(process.uptime()) }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/latest/')) {
    if (tryServeStatic(req, res, url.pathname)) return;
    return send(res, 404, JSON.stringify({ error: 'not found' }));
  }

  // ---- rooms (existing sync) ----
  if (parts[0] === 'room' && parts[1]) {
    const code = parts[1];

    if (req.method === 'GET') {
      const entry = rooms.get(code);
      if (!entry) return send(res, 404, JSON.stringify({ error: 'not found' }));
      return send(res, 200, entry.json);
    }

    if (req.method === 'POST') {
      return readJsonBody(req, 500000, (err, json) => {
        if (err) return send(res, 400, JSON.stringify({ error: 'invalid json' }));
        rooms.set(code, { json: JSON.stringify(json), updatedAt: Date.now() });
        return send(res, 200, JSON.stringify({ ok: true }));
      });
    }
  }

  // ---- user profile / presence ----
  if (parts[0] === 'user' && parts[1]) {
    const id = parts[1];

    if (req.method === 'GET') {
      return send(res, 200, JSON.stringify(publicUserView(id)));
    }

    if (req.method === 'POST') {
      return readJsonBody(req, 120000, (err, body) => {
        if (err) return send(res, 400, JSON.stringify({ error: 'invalid json' }));
        const u = ensureUser(id);
        if (typeof body.nickname === 'string') u.nickname = body.nickname;
        if (typeof body.avatar === 'string' || body.avatar === null) u.avatar = body.avatar;
        u.lastSeenMs = Date.now();
        if (typeof body.nowPlaying === 'string' && body.nowPlaying.length > 0) {
          u.nowPlaying = body.nowPlaying;
          u.lastPlayed = body.nowPlaying;
        } else {
          u.nowPlaying = null;
        }
        return send(res, 200, JSON.stringify({ ok: true }));
      });
    }
  }

  // ---- friend requests ----
  if (parts[0] === 'friend-request' && parts[1] && parts[2] && req.method === 'POST') {
    const fromId = parts[1], toId = parts[2];
    if (fromId === toId) return send(res, 400, JSON.stringify({ error: 'cannot friend yourself' }));
    ensureUser(fromId); ensureUser(toId);
    if (!friendRequests.has(toId)) friendRequests.set(toId, new Set());
    const already = friendships.get(fromId);
    if (already && already.has(toId)) return send(res, 200, JSON.stringify({ ok: true, alreadyFriends: true }));
    friendRequests.get(toId).add(fromId);
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  if (parts[0] === 'friend-requests' && parts[1] && req.method === 'GET') {
    const id = parts[1];
    const set = friendRequests.get(id) || new Set();
    const list = Array.from(set).map(fromId => publicUserView(fromId));
    return send(res, 200, JSON.stringify(list));
  }

  if (parts[0] === 'friend-accept' && parts[1] && parts[2] && req.method === 'POST') {
    const id = parts[1], requesterId = parts[2];
    const pending = friendRequests.get(id);
    if (pending) pending.delete(requesterId);
    if (!friendships.has(id)) friendships.set(id, new Set());
    if (!friendships.has(requesterId)) friendships.set(requesterId, new Set());
    friendships.get(id).add(requesterId);
    friendships.get(requesterId).add(id);
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  if (parts[0] === 'friend-decline' && parts[1] && parts[2] && req.method === 'POST') {
    const id = parts[1], requesterId = parts[2];
    const pending = friendRequests.get(id);
    if (pending) pending.delete(requesterId);
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  if (parts[0] === 'friend-remove' && parts[1] && parts[2] && req.method === 'POST') {
    const id = parts[1], otherId = parts[2];
    if (friendships.has(id)) friendships.get(id).delete(otherId);
    if (friendships.has(otherId)) friendships.get(otherId).delete(id);
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  if (parts[0] === 'friends' && parts[1] && req.method === 'GET') {
    const id = parts[1];
    const set = friendships.get(id) || new Set();
    const list = Array.from(set).map(fid => publicUserView(fid));
    return send(res, 200, JSON.stringify(list));
  }

  // ---- room invites (right-click a friend > invite to room) ----
  if (parts[0] === 'room-invite' && parts[1] && parts[2] && parts[3] && req.method === 'POST') {
    const fromId = parts[1], toId = parts[2], roomCode = parts[3];
    ensureUser(fromId); ensureUser(toId);
    if (!roomInvites.has(toId)) roomInvites.set(toId, []);
    const list = roomInvites.get(toId).filter(inv => inv.fromId !== fromId);
    list.push({ fromId, roomCode, ts: Date.now() });
    roomInvites.set(toId, list);
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  if (parts[0] === 'room-invites' && parts[1] && req.method === 'GET') {
    const id = parts[1];
    const cutoff = Date.now() - 5 * 60 * 1000; // invites expire after 5 minutes
    const fresh = (roomInvites.get(id) || []).filter(inv => inv.ts > cutoff);
    roomInvites.set(id, fresh);
    const result = fresh.map(inv => {
      const u = users.get(inv.fromId);
      return {
        fromId: inv.fromId,
        fromNickname: u ? u.nickname : inv.fromId,
        fromAvatar: u ? u.avatar : null,
        roomCode: inv.roomCode
      };
    });
    return send(res, 200, JSON.stringify(result));
  }

  if (parts[0] === 'room-invite-dismiss' && parts[1] && parts[2] && req.method === 'POST') {
    const id = parts[1], fromId = parts[2];
    if (roomInvites.has(id)) {
      roomInvites.set(id, roomInvites.get(id).filter(inv => inv.fromId !== fromId));
    }
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  send(res, 404, JSON.stringify({ error: 'not found' }));
});

// Housekeeping: drop rooms nobody has touched in hours, and stale invites, so memory doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000; // 6 saat
  for (const [code, entry] of rooms) {
    if (entry.updatedAt < cutoff) rooms.delete(code);
  }
  const inviteCutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, list] of roomInvites) {
    roomInvites.set(id, list.filter(inv => inv.ts > inviteCutoff));
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => console.log(`22phy room server listening on port ${PORT}`));
