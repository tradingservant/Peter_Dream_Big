'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFIX = '/Peter_Dream_Big';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function createServer() {
  return http.createServer(function (req, res) {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === PREFIX || urlPath.startsWith(PREFIX + '/')) {
      urlPath = urlPath.slice(PREFIX.length) || '/';
    }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('forbidden');
      return;
    }
    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, '127.0.0.1', function () {
    process.stdout.write('http://127.0.0.1:' + port + '/\n');
  });
}

module.exports = { createServer: createServer, ROOT: ROOT, PREFIX: PREFIX };
