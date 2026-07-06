// Zero-dependency static file server. Needed because sql.js fetches its
// .wasm file, which requires http(s):// - file:// is blocked by CORS.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8080;
const WEB_ROOT = __dirname;
// The business-logic lib/ lives at the project root, shared with api/ - see
// README.md. Requests under /lib/ are served from there instead of WEB_ROOT.
const LIB_ROOT = path.join(__dirname, '..', 'lib');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const requestPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const isLib = requestPath === '/lib' || requestPath.startsWith('/lib/');
  const root = isLib ? LIB_ROOT : WEB_ROOT;
  const relativePath = isLib ? requestPath.slice('/lib'.length) : requestPath;
  const filePath = path.join(root, relativePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Logbook web UI at http://localhost:${PORT}`);
});
