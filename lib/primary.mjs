// Primary database: user accounts ONLY.
//
// Each user row also stores the CONNECTION to that user's secondary database
// (db_url + db_auth_token), which is how we reach per-user data later.

import { getPrimaryClient } from "./db.mjs";

let schemaReady = false;

export async function ensurePrimarySchema() {
  if (schemaReady) return;
  const db = await getPrimaryClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      db_name       TEXT NOT NULL,
      db_url        TEXT NOT NULL,
      db_auth_token TEXT
    )
  `);
  schemaReady = true;
}

export async function findUserByEmail(email) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
    args: [email],
  });
  return rs.rows[0] || null;
}

export async function findUserById(id) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: "SELECT * FROM users WHERE id = ? LIMIT 1",
    args: [id],
  });
  return rs.rows[0] || null;
}

export async function insertUser(user) {
  const db = await getPrimaryClient();
  await db.execute({
    sql: `INSERT INTO users
            (id, email, password_hash, created_at, db_name, db_url, db_auth_token)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.email,
      user.password_hash,
      user.created_at,
      user.db_name,
      user.db_url,
      user.db_auth_token ?? null,
    ],
  });
}

// Shape a user row for safe return to clients (never leak secrets).
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    databaseName: row.db_name,
  };
}
