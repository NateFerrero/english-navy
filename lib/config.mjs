// Backend configuration, read from environment variables.
//
// Two database providers are supported through the same libSQL protocol:
//
//   - "turso":  per-user databases are provisioned via the Turso Platform API
//               and reached over libsql://. This is what production on Vercel
//               uses.
//   - "local":  per-user databases are plain local libSQL files (file:...),
//               protocol-identical to Turso. This is the Turso-recommended
//               local development mode and needs no credentials, so the whole
//               two-tier flow runs end-to-end without a network.
//
// The provider defaults to "turso" when a Turso API token is present, otherwise
// "local". Set DB_PROVIDER to force one.

import crypto from "node:crypto";

const DEV_AUTH_SECRET = crypto.randomBytes(32).toString("base64url");
const MIN_AUTH_SECRET_LENGTH = 32;

function pickProvider() {
  if (process.env.DB_PROVIDER) return process.env.DB_PROVIDER;
  return process.env.TURSO_API_TOKEN ? "turso" : "local";
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveAuthSecret(provider) {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length >= MIN_AUTH_SECRET_LENGTH) return secret;
  if (provider === "local") return DEV_AUTH_SECRET;

  const err = new Error(
    `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters outside local development.`
  );
  err.status = 500;
  err.code = "CONFIG";
  throw err;
}

const provider = pickProvider();

export const config = {
  provider,

  turso: {
    apiToken: process.env.TURSO_API_TOKEN || "",
    org: process.env.TURSO_ORG || "",
    group: process.env.TURSO_GROUP || "",
    apiBase: process.env.TURSO_API_BASE || "https://api.turso.tech",
    // Tokens need write access for the user's own DB, but should not be immortal.
    tokenExpiration: process.env.TURSO_TOKEN_EXPIRATION || "90d",
    tokenAuthorization: process.env.TURSO_TOKEN_AUTHORIZATION || "full-access",
  },

  // Connection to the single PRIMARY database (user accounts only).
  primary: {
    url: process.env.TURSO_PRIMARY_DB_URL || "",
    authToken: process.env.TURSO_PRIMARY_DB_AUTH_TOKEN || "",
  },

  // HMAC/encryption secret for stateless session tokens and stored DB tokens.
  authSecret: resolveAuthSecret(provider),

  cors: {
    allowedOrigins: parseList(process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN),
  },

  // Where local-provider files live (primary + per-user databases).
  // On Vercel only /tmp is writable, so the local provider is dev-only.
  dataDir: process.env.LOCAL_DATA_DIR || ".data",
};

export function isLocalProvider() {
  return config.provider === "local";
}

// True when the primary DB connection is fully configured for Turso.
export function hasTursoPrimary() {
  return Boolean(config.primary.url);
}
