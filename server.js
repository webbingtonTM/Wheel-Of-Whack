// Minimal static server: no dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const port = process.env.PORT || 8080;
const root = __dirname;
const dataFile = path.join(root, 'sessions.db.json');

// In-memory sessions { id: { id, name, state } }
let sessions = {};
try {
  if (fs.existsSync(dataFile)) {
    sessions = JSON.parse(fs.readFileSync(dataFile, 'utf8')) || {};
  }
} catch {}
function persist() {
  try { fs.writeFileSync(dataFile, JSON.stringify(sessions)); } catch {}
}

// SSE clients per sessionId
const sseClients = new Map(); // sessionId -> Set(res)
function broadcastSession(sessionId) {
  const set = sseClients.get(sessionId);
  if (!set) return;
  const payload = JSON.stringify(sessions[sessionId]?.state || null);
  for (const res of set) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {}
  }
}

const mime = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    let reqPath = decodeURIComponent(parsed.pathname || '/');
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(root, reqPath);
    // Prevent path traversal
    if (!filePath.startsWith(root)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // API routes
    if (reqPath.startsWith('/api/')) {
      // CORS for safety (same-origin typically)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

      if (reqPath === '/api/sessions' && req.method === 'GET') {
        const list = Object.values(sessions).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        res.end(JSON.stringify(list));
        return;
      }
      // GET/PUT state by id: /api/state/:id
      const m = reqPath.match(/^\/api\/state\/([A-Za-z0-9_-]+)$/);
      if (m) {
        const id = m[1];
        if (req.method === 'GET') {
          const st = sessions[id]?.state || null;
          res.setHeader('Content-Type', 'application/json; charset=UTF-8');
          res.end(JSON.stringify(st));
          return;
        }
        if (req.method === 'PUT' || req.method === 'POST') {
          let body = '';
          req.on('data', (ch) => { body += ch; if (body.length > 5e6) req.destroy(); });
          req.on('end', () => {
            try {
              const st = JSON.parse(body || 'null');
              if (!sessions[id]) sessions[id] = { id, name: `Session ${id}`, createdAt: Date.now(), state: null };
              sessions[id].state = st;
              persist();
              res.setHeader('Content-Type', 'application/json; charset=UTF-8');
              res.end(JSON.stringify({ ok: true }));
              broadcastSession(id);
            } catch (e) {
              res.statusCode = 400; res.end('Invalid JSON');
            }
          });
          return;
        }
      }
      // SSE stream: /api/stream?sessionId=...
      if (reqPath === '/api/stream' && req.method === 'GET') {
        const id = parsed.query.sessionId;
        if (!id) { res.statusCode = 400; res.end('sessionId required'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write('\n');
        // Send initial state
        try { res.write(`data: ${JSON.stringify(sessions[id]?.state || null)}\n\n`); } catch {}
        let set = sseClients.get(id);
        if (!set) { set = new Set(); sseClients.set(id, set); }
        set.add(res);
        req.on('close', () => { set.delete(res); });
        return;
      }
      res.statusCode = 404; res.end('Not Found');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const serveFile = (p) => {
        const ext = path.extname(p).toLowerCase();
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        fs.createReadStream(p).pipe(res);
      };
      if (stat.isDirectory()) {
        const index = path.join(filePath, 'index.html');
        fs.exists(index, (exists) => {
          serveFile(exists ? index : filePath);
        });
      } else {
        serveFile(filePath);
      }
    });
  })
  .listen(port, () => {
    console.log(`Serving on http://localhost:${port}`);
  });
