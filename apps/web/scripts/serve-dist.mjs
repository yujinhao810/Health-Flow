import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(webRoot, 'dist');
const backend = process.env.API_ORIGIN || 'http://127.0.0.1:3001';
const host = '127.0.0.1';
const port = Number(process.env.PREVIEW_PORT || 4173);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    await proxyApi(request, response, `${backend}${url.pathname.slice(4)}${url.search}`);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end('Method Not Allowed');
    return;
  }

  let filePath = join(distRoot, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !extname(filePath)) filePath = join(distRoot, 'index.html');

  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(distRoot, 'index.html');
  }

  if (!existsSync(filePath)) filePath = join(distRoot, 'index.html');
  sendFile(request, response, filePath);
});

server.listen(port, host, () => {
  console.log(`Preview listening on http://${host}:${port}`);
});

const keepAlive = setInterval(() => undefined, 60_000);

function close() {
  clearInterval(keepAlive);
  server.close(() => process.exit(0));
}

process.once('SIGINT', close);
process.once('SIGTERM', close);

async function proxyApi(request, response, targetUrl) {
  try {
    const headers = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (!value || ['host', 'connection', 'content-length', 'accept-encoding'].includes(key)) continue;
      headers[key] = Array.isArray(value) ? value.join(',') : value;
    }

    const body = await readBody(request);
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: body.length ? body : undefined,
      duplex: body.length ? 'half' : undefined,
    });

    response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'content-encoding', 'content-length', 'connection'].includes(key.toLowerCase())) {
        response.setHeader(key, value);
      }
    });

    if (!upstream.body) {
      response.end();
      return;
    }

    response.flushHeaders?.();
    Readable.fromWeb(upstream.body).pipe(response);
  } catch (error) {
    response.statusCode = 502;
    response.end(error instanceof Error ? error.message : String(error));
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function sendFile(request, response, filePath) {
  response.statusCode = 200;
  response.setHeader('Content-Type', mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream');
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}
