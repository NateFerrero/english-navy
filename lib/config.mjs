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

function pickProvider() {
  if (process.env.DB_PROVIDER) return process.env.DB_PROVIDER;
  return process.env.TURSO_API_TOKEN ? "turso" : "local";
}

export const config = {
  provider: pickProvider(),

  turso: {
    apiToken: process.env.TURSO_API_TOKEN || "",
    org: process.env.TURSO_ORG || "",
    group: process.env.TURSO_GROUP || "",
    apiBase: process.env.TURSO_API_BASE || "https://api.turso.tech",
    // Token lifetime + scope for the per-user database SQL tokens we mint.
    tokenExpiration: process.env.TURSO_TOKEN_EXPIRATION || "never",
    tokenAuthorization: process.env.TURSO_TOKEN_AUTHORIZATION || "full-access",
  },

  // Connection to the single PRIMARY database (user accounts only).
  primary: {
    url: process.env.TURSO_PRIMARY_DB_URL || "",
    authToken: process.env.TURSO_PRIMARY_DB_AUTH_TOKEN || "",
  },

  // HMAC secret for stateless session tokens.
  authSecret: process.env.AUTH_SECRET || "dev-insecure-secret-change-me",

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
