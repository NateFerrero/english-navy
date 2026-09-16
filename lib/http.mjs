// Small HTTP helpers that work identically under the local dev server
// (server.mjs) and Vercel's Node runtime, because they only use the standard
// Node req/res objects — no Vercel-specific res.json()/req.body assumptions.

import { config } from "./config.mjs";

const DEFAULT_JSON_LIMIT_BYTES = 64 * 1024;
const SESSION_COOKIE = "en_session";
const rateLimitBuckets = new Map();

function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return host ? `${proto}://${host}` : "";
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === requestOrigin(req) || config.cors.allowedOrigins.includes(origin);
}

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

// Read + parse a JSON request body. Works whether the body was already parsed
// by the platform (Vercel sets req.body) or must be streamed (local server).
export async function readJsonBody(req, { limitBytes = DEFAULT_JSON_LIMIT_BYTES } = {}) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      if (Buffer.byteLength(req.body) > limitBytes) {
        throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
      }
      return req.body ? JSON.parse(req.body) : {};
    }
    if (Buffer.byteLength(JSON.stringify(req.body)) > limitBytes) {
      throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
    }
    return req.body;
  }

  let raw = "";
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > limitBytes) {
      throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
    }
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header || typeof header !== "string") return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [decodeURIComponent(name), decodeURIComponent(rest.join("="))];
    })
  );
}

export function getBearerToken(req) {
  const header = req.headers["authorization"] || req.headers["Authorization"];
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function getSessionToken(req) {
  return getBearerToken(req) || parseCookies(req)[SESSION_COOKIE] || null;
}

function cookieSecureAttribute(req) {
  const proto = req.headers["x-forwarded-proto"];
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return proto === "https" || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"))
    ? "; Secure"
    : "";
}

export function setSessionCookie(req, res, token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${cookieSecureAttribute(req)}`
  );
}

export function clearSessionCookie(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecureAttribute(req)}`
  );
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(req, bucket, { limit, windowMs }) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const hits = (rateLimitBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (hits.length >= limit) {
    throw httpError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
  }
  hits.push(now);
  rateLimitBuckets.set(key, hits);
}

// Handle CORS preflight; returns true if the request was fully handled.
export function handlePreflight(req, res) {
  setSecurityHeaders(res);
  setCors(req, res);
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(req)) {
      res.writeHead(403);
      res.end();
      return true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: `Method not allowed. Allowed: ${allowed.join(", ")}` });
}

// Wrap a handler so thrown errors become clean JSON 4xx/5xx responses.
export function withErrors(handler) {
  return async function wrapped(req, res) {
    try {
      await handler(req, res);
    } catch (err) {
      const status = Number(err.status) || 500;
      const message =
        status >= 500 ? "Internal server error" : err.message || "Request failed";
      if (status >= 500) console.error("[api] error:", err);
      if (!res.headersSent) sendJson(res, status, { error: message, code: err.code });
    }
  };
}

// Helper to throw typed HTTP errors from handlers.
export function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}
