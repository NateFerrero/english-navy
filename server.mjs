// Zero-dependency static dev server for The English Navy.
//
// Uses only Node's built-in modules (no npm packages). Serves files from the
// project root, sets a correct MIME type for .mjs so ES modules load, and falls
// back to index.html for any path that isn't a real file (SPA / pushState
// routing needs this so a hard refresh on /signup still boots the app).

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function tryFile(pathname) {
  // Prevent path traversal outside ROOT.
  const safePath = normalize(join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) return null;
  try {
    const info = await stat(safePath);
    if (info.isFile()) return safePath;
  } catch {
    /* not found */
  }
  return null;
}

async function send(res, filePath, status = 200) {
  const body = await readFile(filePath);
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    // 1) Serve a real file when one exists.
    const file = await tryFile(pathname);
    if (file) {
      await send(res, file);
      return;
    }

    // 2) Asset-like paths (with an extension) that don't exist are 404s.
    if (extname(pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    // 3) SPA fallback: any other path renders the app shell.
    await send(res, join(ROOT, "index.html"));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`The English Navy dev server running at http://${HOST}:${PORT}`);
  console.log(`Tip: open http://localhost:${PORT}/?api=mock to use the mock API.`);
});
