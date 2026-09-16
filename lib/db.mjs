// libSQL client factories for the primary and per-user databases.
//
// The same @libsql/client talks to both Turso (libsql://... + auth token) and
// local files (file:...), so nothing above this layer needs to know which
// provider is active.

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { unsealSecret } from "./auth.mjs";
import { config, isLocalProvider } from "./config.mjs";

// Default local file URL for the primary database when no Turso URL is set.
export function primaryUrl() {
  if (config.primary.url) return config.primary.url;
  return `file:${config.dataDir}/primary.db`;
}

// libSQL file URLs look like `file:relative/path.db` (and may use file:// or
// file:/// forms). Resolve the filesystem path and ensure its directory exists.
async function ensureDirForFileUrl(url) {
  if (!url.startsWith("file:")) return;
  let path = url.slice("file:".length);
  if (path.startsWith("//")) path = path.slice(2);
  await mkdir(dirname(path), { recursive: true });
}

// Client for the single primary (user accounts) database.
export async function getPrimaryClient() {
  const url = primaryUrl();
  await ensureDirForFileUrl(url);
  return createClient({ url, authToken: config.primary.authToken || undefined });
}

// Client for a specific user's secondary database, using the connection info
// stored on the user's row in the primary database.
export async function getUserClient(user) {
  const url = user.db_url;
  if (isLocalProvider()) await ensureDirForFileUrl(url);
  const authToken = unsealSecret(user.db_auth_token);
  return createClient({ url, authToken: authToken || undefined });
}

export async function getConnectionClient(connection) {
  const url = connection.db_url;
  if (isLocalProvider()) await ensureDirForFileUrl(url);
  const authToken = unsealSecret(connection.db_auth_token) || connection.db_auth_token;
  return createClient({ url, authToken: authToken || undefined });
}
