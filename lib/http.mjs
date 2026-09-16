// Small HTTP helpers that work identically under the local dev server
// (server.mjs) and Vercel's Node runtime, because they only use the standard
// Node req/res objects — no Vercel-specific res.json()/req.body assumptions.

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

// Read + parse a JSON request body. Works whether the body was already parsed
// by the platform (Vercel sets req.body) or must be streamed (local server).
export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      return req.body ? JSON.parse(req.body) : {};
    }
    return req.body;
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function getBearerToken(req) {
  const header = req.headers["authorization"] || req.headers["Authorization"];
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Handle CORS preflight; returns true if the request was fully handled.
export function handlePreflight(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
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
