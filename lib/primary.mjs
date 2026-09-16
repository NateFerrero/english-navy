// Primary database: user accounts and invite codes.
//
// Each user row also stores the CONNECTION to that user's secondary database
// (db_url + db_auth_token), which is how we reach per-user data later.

import crypto from "node:crypto";
import { getPrimaryClient } from "./db.mjs";

let schemaReady = false;
const MAX_INVITE_CODES_PER_USER = 100;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ACTIVITY_LOG_ROWS = 100;

function generateInviteCode() {
  const parts = [];
  for (let group = 0; group < 3; group++) {
    let part = "";
    for (let i = 0; i < 4; i++) {
      part += INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}

export function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

async function columnExists(db, table, column) {
  const rs = await db.execute(`PRAGMA table_info(${table})`);
  return rs.rows.some((row) => row.name === column);
}

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
      db_auth_token TEXT,
      invited_by_user_id TEXT
    )
  `);
  if (!(await columnExists(db, "users", "invited_by_user_id"))) {
    await db.execute("ALTER TABLE users ADD COLUMN invited_by_user_id TEXT");
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code               TEXT PRIMARY KEY,
      created_by_user_id TEXT NOT NULL,
      created_at         TEXT NOT NULL,
      claimed_by_user_id TEXT,
      claimed_at         TEXT
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by_user_id
      ON invite_codes (created_by_user_id, created_at)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_invite_codes_claimed_by_user_id
      ON invite_codes (claimed_by_user_id)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id            TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      actor_user_id TEXT,
      event_type    TEXT NOT NULL,
      invite_code   TEXT,
      metadata      TEXT,
      created_at    TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_owner_created_at
      ON activity_log (owner_user_id, created_at DESC)
  `);
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS limit_invite_codes_per_user
    BEFORE INSERT ON invite_codes
    FOR EACH ROW
    WHEN (
      SELECT COUNT(*)
      FROM invite_codes
      WHERE created_by_user_id = NEW.created_by_user_id
    ) >= ${MAX_INVITE_CODES_PER_USER}
    BEGIN
      SELECT RAISE(ABORT, 'INVITE_CODE_LIMIT_REACHED');
    END
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
            (id, email, password_hash, created_at, db_name, db_url, db_auth_token, invited_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.email,
      user.password_hash,
      user.created_at,
      user.db_name,
      user.db_url,
      user.db_auth_token ?? null,
      user.invited_by_user_id ?? null,
    ],
  });
}

export async function updateUserPassword(userId, passwordHash) {
  const db = await getPrimaryClient();
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [passwordHash, userId],
  });
}

export async function recordActivityLog({
  ownerUserId,
  actorUserId = ownerUserId,
  eventType,
  inviteCode = null,
  metadata = null,
  createdAt = new Date().toISOString(),
}) {
  const db = await getPrimaryClient();
  await db.execute({
    sql: `INSERT INTO activity_log
            (id, owner_user_id, actor_user_id, event_type, invite_code, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      `log_${crypto.randomBytes(9).toString("hex")}`,
      ownerUserId,
      actorUserId,
      eventType,
      inviteCode ? normalizeInviteCode(inviteCode) : null,
      metadata ? JSON.stringify(metadata) : null,
      createdAt,
    ],
  });
}

export async function listActivityLogForUser(userId, limit = MAX_ACTIVITY_LOG_ROWS) {
  const db = await getPrimaryClient();
  const safeLimit = Math.max(1, Math.min(MAX_ACTIVITY_LOG_ROWS, Number(limit) || MAX_ACTIVITY_LOG_ROWS));
  const rs = await db.execute({
    sql: `SELECT
            activity_log.id,
            activity_log.owner_user_id,
            activity_log.actor_user_id,
            activity_log.event_type,
            activity_log.invite_code,
            activity_log.metadata,
            activity_log.created_at,
            actor.email AS actor_email
          FROM activity_log
          LEFT JOIN users AS actor ON actor.id = activity_log.actor_user_id
          WHERE activity_log.owner_user_id = ?
          ORDER BY activity_log.created_at DESC
          LIMIT ?`,
    args: [userId, safeLimit],
  });
  return rs.rows.map(publicActivityLog);
}

export async function countInviteCodesCreatedByUser(userId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: "SELECT COUNT(*) AS count FROM invite_codes WHERE created_by_user_id = ?",
    args: [userId],
  });
  return Number(rs.rows[0]?.count || 0);
}

export async function listInviteCodesByCreator(userId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT code, created_by_user_id, created_at, claimed_by_user_id, claimed_at
          FROM invite_codes
          WHERE created_by_user_id = ?
          ORDER BY created_at DESC`,
    args: [userId],
  });
  return rs.rows.map(publicInviteCode);
}

export async function createInviteCodesForUser(userId, count) {
  const db = await getPrimaryClient();
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const codes = new Set();
    while (codes.size < count) codes.add(generateInviteCode());

    try {
      await db.batch(
        [...codes].map((code) => ({
          sql: `INSERT INTO invite_codes (code, created_by_user_id, created_at)
                VALUES (?, ?, ?)`,
          args: [code, userId, createdAt],
        })),
        "write"
      );
      return [...codes].map((code) =>
        publicInviteCode({
          code,
          created_by_user_id: userId,
          created_at: createdAt,
          claimed_by_user_id: null,
          claimed_at: null,
        })
      );
    } catch (err) {
      if (String(err.message || "").includes("UNIQUE")) continue;
      throw err;
    }
  }

  throw new Error("Could not generate unique invite codes.");
}

export async function reserveInviteCodeForUser(code, userId) {
  const normalized = normalizeInviteCode(code);
  const claimedAt = new Date().toISOString();
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `UPDATE invite_codes
          SET claimed_by_user_id = ?, claimed_at = ?
          WHERE code = ? AND claimed_by_user_id IS NULL`,
    args: [userId, claimedAt, normalized],
  });
  if (Number(rs.rowsAffected || 0) === 0) return null;

  const invite = await db.execute({
    sql: `SELECT code, created_by_user_id, created_at, claimed_by_user_id, claimed_at
          FROM invite_codes
          WHERE code = ?
          LIMIT 1`,
    args: [normalized],
  });
  return invite.rows[0] || null;
}

export async function releaseInviteCodeReservation(code, userId) {
  const db = await getPrimaryClient();
  await db.execute({
    sql: `UPDATE invite_codes
          SET claimed_by_user_id = NULL, claimed_at = NULL
          WHERE code = ? AND claimed_by_user_id = ?`,
    args: [normalizeInviteCode(code), userId],
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

export function publicInviteCode(row) {
  return {
    code: row.code,
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
    claimedByUserId: row.claimed_by_user_id || null,
  };
}

export function publicActivityLog(row) {
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
    type: row.event_type,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id || null,
    actorEmail: row.actor_email || null,
    inviteCode: row.invite_code || null,
    metadata,
  };
}
