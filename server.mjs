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
const STATIC_ALLOWLIST = ["/index.html", "/styles.css", "/manifest.webmanifest", "/sw.mjs", "/offline.html", "/icons/", "/src/"];
const STATIC_FILE_ALLOWLIST = new Set([
  resolve(ROOT, "index.html"),
  resolve(ROOT, "styles.css"),
  resolve(ROOT, "manifest.webmanifest"),
  resolve(ROOT, "sw.mjs"),
  resolve(ROOT, "offline.html"),
]);
const STATIC_DIR_ALLOWLIST = [resolve(ROOT, "icons"), resolve(ROOT, "src")];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function isBlockedPathname(pathname) {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return (
    pathname
      .split("/")
      .filter(Boolean)
      .some((segment) => segment.startsWith(".")) ||
    ["api", "lib", "node_modules"].includes(firstSegment) ||
    ["AGENTS.md", "README.md", "LICENSE", "package.json", "package-lock.json", "server.mjs", "build.mjs", "vercel.json"].includes(
      firstSegment
    )
  );
}

async function tryFile(pathname) {
  if (!STATIC_ALLOWLIST.some((entry) => pathname === entry || pathname.startsWith(entry))) {
    return null;
  }
  // Prevent path traversal outside ROOT.
  const safePath = normalize(join(ROOT, pathname));
  if (!safePath.startsWith(`${ROOT}/`) && safePath !== ROOT) return null;
  if (
    !STATIC_FILE_ALLOWLIST.has(safePath) &&
    !STATIC_DIR_ALLOWLIST.some((dir) => safePath.startsWith(`${dir}/`))
  ) {
    return null;
  }
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
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

// Route /api/* to the same serverless handler modules Vercel would run, so the
// full stack works locally. Each handler is `export default (req, res) => ...`.
const apiModuleCache = new Map();

async function handleApi(req, res, pathname) {
  const name = pathname.slice("/api/".length).replace(/\/+$/, "");
  // Only allow simple, single-segment route names (matches api/<name>.js).
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let handler = apiModuleCache.get(name);
  if (!handler) {
    for (const ext of [".mjs", ".js"]) {
      const modUrl = new URL(`./api/${name}${ext}`, import.meta.url);
      try {
        const mod = await import(modUrl.href);
        handler = mod.default;
        break;
      } catch {
        /* try the next supported module extension */
      }
    }
    if (!handler) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: `No API route '/api/${name}'` }));
      return;
    }
    apiModuleCache.set(name, handler);
  }

  await handler(req, res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // Expose parsed query to handlers (parity with Vercel's req.query).
    req.query = Object.fromEntries(url.searchParams.entries());

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    if (isBlockedPathname(pathname)) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end("Not found");
      return;
    }

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
    console.error("[server] error:", err);
    res.end("Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`The English Navy dev server running at http://${HOST}:${PORT}`);
  console.log(`Tip: open http://localhost:${PORT}/?api=mock to use the mock API.`);
});
