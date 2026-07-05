// 22phy oda senkron sunucusu.
// Oda senkronu + basit güncelleme dağıtımı: /latest/ altında sürüm
// bilgisi (version.json) ve en son SudisphyApp.zip'i sunuyor, uygulama
// içindeki "Güncelle" düğmesi buraya bakıyor.

const http = require('http');
const fs = require('fs');
const path = require('path');

const rooms = new Map(); // roomCode -> { json: string, updatedAt: number }
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

function tryServeStatic(req, res, pathname) {
  // Only ever serve files that live directly under /public - never let
  // the requested path escape that folder.
  const rel = pathname.replace(/^\/latest\//, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

  const ext = path.extname(filePath);
  const contentType = ext === '.zip' ? 'application/zip'
    : ext === '.json' ? 'application/json'
    : 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // e.g. ['room', '12345']

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/') {
    return send(res, 200, JSON.stringify({ ok: true, rooms: rooms.size, uptimeSec: Math.floor(process.uptime()) }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/latest/')) {
    if (tryServeStatic(req, res, url.pathname)) return;
    return send(res, 404, JSON.stringify({ error: 'not found' }));
  }

  if (parts[0] === 'room' && parts[1]) {
    const code = parts[1];

    if (req.method === 'GET') {
      const entry = rooms.get(code);
      if (!entry) return send(res, 404, JSON.stringify({ error: 'not found' }));
      return send(res, 200, entry.json);
    }

    if (req.method === 'POST') {
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 500000) { // 500KB safety cap per room
          tooBig = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooBig) return;
        try {
          JSON.parse(body); // just validate it's real JSON
          rooms.set(code, { json: body, updatedAt: Date.now() });
          return send(res, 200, JSON.stringify({ ok: true }));
        } catch (e) {
          return send(res, 400, JSON.stringify({ error: 'invalid json' }));
        }
      });
      return;
    }
  }

  send(res, 404, JSON.stringify({ error: 'not found' }));
});

// Housekeeping: drop rooms nobody has touched in hours so memory doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000; // 6 saat
  for (const [code, entry] of rooms) {
    if (entry.updatedAt < cutoff) rooms.delete(code);
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => console.log(`22phy room server listening on port ${PORT}`));
