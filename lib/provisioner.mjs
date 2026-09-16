// Provisions a NEW secondary database for a user or Realm and returns the connection
// details, which the caller stores in the primary database.
//
//   - Turso provider: creates a real Turso database via the Platform API and
//     mints a full-access SQL auth token for it.
//   - Local provider: creates a local libSQL file (protocol-identical), so the
//     same code path runs end-to-end in development without credentials.

import { config } from "./config.mjs";
import { httpError } from "./http.mjs";

// Turso database names must be lowercase letters, numbers, and dashes, <= 64.
function safeDbName(resourceId) {
  const base = `en-${resourceId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return base.slice(0, 64);
}

async function tursoRequest(path, options = {}) {
  const res = await fetch(`${config.turso.apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.turso.apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const message = json.error || `Turso API ${res.status}: ${text.slice(0, 200)}`;
    throw httpError(502, message, "TURSO_API_ERROR");
  }
  return json;
}

async function createDatabase(dbName) {
  const body = { name: dbName, group: config.turso.group };
  return tursoRequest(`/v1/organizations/${config.turso.org}/databases`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function mintTursoToken(dbName) {
  const query = new URLSearchParams({
    expiration: config.turso.tokenExpiration,
    authorization: config.turso.tokenAuthorization,
  });
  const tokenRes = await tursoRequest(
    `/v1/organizations/${config.turso.org}/databases/${dbName}/auth/tokens?${query}`,
    { method: "POST" }
  );
  if (!tokenRes.jwt) {
    throw httpError(502, "Turso did not return an auth token", "TURSO_API_ERROR");
  }
  return tokenRes.jwt;
}

async function provisionTurso(resourceId) {
  if (!config.turso.org) {
    throw httpError(500, "TURSO_ORG is not configured", "CONFIG");
  }
  if (!config.turso.group) {
    throw httpError(500, "TURSO_GROUP is not configured", "CONFIG");
  }
  const dbName = safeDbName(resourceId);

  // 1) Create the database in the configured group.
  const created = await createDatabase(dbName);

  const hostname = created?.database?.Hostname || created?.database?.hostname;
  if (!hostname) {
    throw httpError(502, "Turso did not return a database hostname", "TURSO_API_ERROR");
  }

  return {
    db_name: dbName,
    db_url: `libsql://${hostname}`,
    db_auth_token: await mintTursoToken(dbName),
  };
}

function provisionLocal(resourceId, folder) {
  const dbName = safeDbName(resourceId);
  return {
    db_name: dbName,
    db_url: `file:${config.dataDir}/${folder}/${dbName}.db`,
    db_auth_token: null,
  };
}

export async function provisionUserDatabase(userId) {
  if (config.provider === "turso") return provisionTurso(userId);
  return provisionLocal(userId, "users");
}

export async function provisionRealmDatabase(realmId) {
  if (config.provider === "turso") return provisionTurso(realmId);
  return provisionLocal(realmId, "realms");
}

export async function mintDatabaseToken(dbName) {
  if (config.provider === "turso") return mintTursoToken(dbName);
  return null;
}
