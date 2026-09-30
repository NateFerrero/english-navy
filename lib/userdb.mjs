// Per-user (secondary) database schema + access.
//
// This database holds a single user's application data. We open it using the
// connection details stored on the user's row in the PRIMARY database.

import { sealSecret } from "./auth.mjs";
import { getConnectionClient, getUserClient } from "./db.mjs";

const PAGE_RANK_PREFIX = "pageRank:";

export async function ensureUserSchema(user) {
  const db = await getUserClient(user);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS profile (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_realm_access (
      realm_id      TEXT PRIMARY KEY,
      db_url        TEXT NOT NULL,
      db_auth_token TEXT,
      granted_at    TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id         TEXT PRIMARY KEY,
      realm_id   TEXT,
      event_type TEXT NOT NULL,
      body       TEXT NOT NULL,
      metadata   TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_user_notifications_created
      ON user_notifications (created_at DESC)
  `);
  return db;
}

export async function ensureRealmSchema(connection) {
  const db = await getConnectionClient(connection);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS realm_metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  return db;
}

export async function seedRealmDatabase(connection, realm) {
  const db = await ensureRealmSchema(connection);
  await db.batch([
    { sql: "INSERT OR REPLACE INTO realm_metadata (key, value) VALUES (?, ?)", args: ["title", realm.title] },
    {
      sql: "INSERT OR REPLACE INTO realm_metadata (key, value) VALUES (?, ?)",
      args: ["description", realm.description || ""],
    },
    { sql: "INSERT OR REPLACE INTO realm_metadata (key, value) VALUES (?, ?)", args: ["created_at", realm.created_at] },
  ]);
}

export async function getUserRealmAccess(user, realmId) {
  const db = await ensureUserSchema(user);
  const rs = await db.execute({
    sql: "SELECT realm_id, db_url, db_auth_token FROM user_realm_access WHERE realm_id = ? LIMIT 1",
    args: [realmId],
  });
  return rs.rows[0] || null;
}

export async function addUserNotification(user, { realmId = null, eventType, body, metadata = null, createdAt = new Date().toISOString() }) {
  if (!user) return null;
  const db = await ensureUserSchema(user);
  const id = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `INSERT INTO user_notifications (id, realm_id, event_type, body, metadata, read, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)`,
    args: [id, realmId, eventType, body, metadata ? JSON.stringify(metadata) : null, createdAt],
  });
  return id;
}

export async function listUserNotifications(user, { realmId = null, limit = 50 } = {}) {
  const db = await ensureUserSchema(user);
  const rs = realmId
    ? await db.execute({
        sql: `SELECT * FROM user_notifications
              WHERE realm_id = ?
              ORDER BY created_at DESC
              LIMIT ?`,
        args: [realmId, limit],
      })
    : await db.execute({
        sql: `SELECT * FROM user_notifications
              ORDER BY created_at DESC
              LIMIT ?`,
        args: [limit],
      });
  return rs.rows.map((row) => {
    let metadata = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      realmId: row.realm_id || null,
      eventType: row.event_type,
      body: row.body,
      metadata,
      read: Boolean(Number(row.read)),
      createdAt: row.created_at,
    };
  });
}

export async function countUnreadNotifications(user) {
  const db = await ensureUserSchema(user);
  const rs = await db.execute("SELECT COUNT(*) AS count FROM user_notifications WHERE read = 0");
  return Number(rs.rows[0]?.count || 0);
}

export async function markUserNotificationsRead(user, ids = []) {
  const db = await ensureUserSchema(user);
  if (!ids.length) {
    await db.execute("UPDATE user_notifications SET read = 1 WHERE read = 0");
    return;
  }
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!unique.length) return;
  const placeholders = unique.map(() => "?").join(", ");
  await db.execute({
    sql: `UPDATE user_notifications SET read = 1 WHERE id IN (${placeholders})`,
    args: unique,
  });
}

export async function grantRealmAccess(user, { realmId, dbUrl, dbAuthToken }) {
  const db = await ensureUserSchema(user);
  await db.execute({
    sql: `INSERT INTO user_realm_access (realm_id, db_url, db_auth_token, granted_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(realm_id) DO UPDATE SET
            db_url = excluded.db_url,
            db_auth_token = excluded.db_auth_token,
            granted_at = excluded.granted_at`,
    args: [realmId, dbUrl, dbAuthToken ? sealSecret(dbAuthToken) : null, new Date().toISOString()],
  });
}

// Initialize a freshly provisioned user database with a starter profile.
export async function seedUserDatabase(user) {
  const db = await ensureUserSchema(user);
  const displayName = user.email.split("@")[0];
  await db.batch([
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["display_name", displayName] },
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["first_name", ""] },
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["last_name", ""] },
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["bio", ""] },
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["default_timezone", "UTC"] },
    { sql: "INSERT OR IGNORE INTO profile (key, value) VALUES (?, ?)", args: ["created_at", user.created_at] },
  ]);
}

export async function getProfile(user) {
  const db = await getUserClient(user);
  const rs = await db.execute("SELECT key, value FROM profile");
  const profile = {};
  for (const row of rs.rows) profile[row.key] = row.value;
  return profile;
}

export async function updateProfile(user, updates) {
  const db = await getUserClient(user);
  const allowed = ["display_name", "first_name", "last_name", "bio", "default_timezone"];
  const statements = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      statements.push({
        sql: `INSERT INTO profile (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [key, String(updates[key])],
      });
    }
  }
  if (statements.length) await db.batch(statements);
  return getProfile(user);
}

function pageRankKey(path) {
  return `${PAGE_RANK_PREFIX}${path}`;
}

export async function getPageRanks(user) {
  const db = await ensureUserSchema(user);
  const rs = await db.execute({
    sql: "SELECT key, value FROM user_preferences WHERE key LIKE ?",
    args: [`${PAGE_RANK_PREFIX}%`],
  });
  const ranks = {};
  for (const row of rs.rows) {
    const path = String(row.key || "").slice(PAGE_RANK_PREFIX.length);
    const count = Number.parseInt(row.value, 10);
    if (path && Number.isFinite(count) && count > 0) ranks[path] = count;
  }
  return ranks;
}

export async function incrementPageRank(user, path) {
  const db = await ensureUserSchema(user);
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO user_preferences (key, value, updated_at)
            VALUES (?, '1', ?)
          ON CONFLICT(key) DO UPDATE SET
            value = CAST((CAST(user_preferences.value AS INTEGER) + 1) AS TEXT),
            updated_at = excluded.updated_at`,
    args: [pageRankKey(path), now],
  });
  return getPageRanks(user);
}

export async function resetPageRanks(user) {
  const db = await ensureUserSchema(user);
  await db.execute({
    sql: "DELETE FROM user_preferences WHERE key LIKE ?",
    args: [`${PAGE_RANK_PREFIX}%`],
  });
  return {};
}
