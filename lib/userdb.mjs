// Per-user (secondary) database schema + access.
//
// This database holds a single user's application data. We open it using the
// connection details stored on the user's row in the PRIMARY database.

import { getUserClient } from "./db.mjs";

export async function ensureUserSchema(user) {
  const db = await getUserClient(user);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS profile (
      key   TEXT PRIMARY KEY,
      value TEXT
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
