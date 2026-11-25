import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.argv[2] ?? 4177);
const pages = new Set(['index.html', 'play.html', 'styles.css', 'play.js', 'comic-gl.js']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start <= end && start < size) return { start, end };
}

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let file;
  let size;
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!pages.has(path) && !/^(assets|vendor)\//.test(path)) throw new Error('Not found');
    file = resolve(root, path);
    const remainder = relative(root, file);
    if (isAbsolute(remainder) || remainder.startsWith('..')) throw new Error('Not found');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not found');
    size = info.size;
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Content-Length': size,
  };
  const range = request.headers.range ? byteRange(request.headers.range, size) : undefined;
  if (request.headers.range && !range) {
    response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    headers['Content-Length'] = range.end - range.start + 1;
  }
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const body = createReadStream(file, range);
  response.once('close', () => body.destroy());
  body.once('error', () => response.destroy());
  body.pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`手势滤镜游乐园 · http://127.0.0.1:${port}/`);
});
