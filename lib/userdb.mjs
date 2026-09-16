// Per-user (secondary) database schema + access.
//
// This database holds a single user's application data. We open it using the
// connection details stored on the user's row in the PRIMARY database.

import { getUserClient } from "./db.mjs";

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
  return db;
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
