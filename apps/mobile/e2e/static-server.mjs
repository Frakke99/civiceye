/**
 * Statische server voor de geëxporteerde web-app.
 *
 * Doet één ding dat een gewone file-server niet doet: onbekende paden naar
 * index.html sturen. De web-build is een SPA (web.output: 'single'), dus zonder
 * die rewrite werkt een directe link naar /report/<id> niet — precies de fout
 * die een verkeerd geconfigureerde host maakt.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export function serveStatic(dist, port) {
  const server = http.createServer((req, res) => {
    const pad = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let bestand = path.join(dist, pad);

    // Containment: serve-demo.mjs adverteert deze server op het LAN, dus een
    // pad met ../ mag nooit buiten de dist-map komen. De dist-map zelf ('/')
    // is wél toegestaan — die valt hieronder terug op index.html.
    const wortel = path.resolve(dist);
    const doel = path.resolve(bestand);
    if (doel !== wortel && !doel.startsWith(wortel + path.sep)) {
      res.writeHead(403);
      return res.end('forbidden');
    }

    if (pad === '/' || !fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) {
      const metHtml = path.join(dist, pad + '.html');
      bestand = fs.existsSync(metHtml) ? metHtml : path.join(dist, 'index.html');
    }

    try {
      const body = fs.readFileSync(bestand);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(bestand)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(e));
    }
  });
  server.listen(port);
  return server;
}
