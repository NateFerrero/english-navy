// Primary database: user accounts and invite codes.
//
// Each user row also stores the CONNECTION to that user's secondary database
// (db_url + db_auth_token), which is how we reach per-user data later.

import crypto from "node:crypto";
import { sealSecret } from "./auth.mjs";
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

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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
      invited_by_user_id TEXT,
      session_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  if (!(await columnExists(db, "users", "invited_by_user_id"))) {
    await db.execute("ALTER TABLE users ADD COLUMN invited_by_user_id TEXT");
  }
  if (!(await columnExists(db, "users", "session_version"))) {
    await db.execute("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0");
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
    CREATE TABLE IF NOT EXISTS contacts (
      id              TEXT PRIMARY KEY,
      owner_user_id   TEXT NOT NULL,
      contact_email   TEXT NOT NULL,
      contact_user_id TEXT,
      source          TEXT NOT NULL DEFAULT 'manual',
      created_at      TEXT NOT NULL,
      UNIQUE(owner_user_id, contact_email)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_contacts_contact_email
      ON contacts (contact_email)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_thread_participants (
      thread_id TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, user_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_thread_participants_user
      ON message_thread_participants (user_id, joined_at DESC)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id             TEXT PRIMARY KEY,
      thread_id      TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      body           TEXT NOT NULL,
      created_at     TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_created_at
      ON messages (thread_id, created_at ASC)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_invitations (
      id             TEXT PRIMARY KEY,
      thread_id      TEXT NOT NULL UNIQUE,
      inviter_user_id TEXT NOT NULL,
      invitee_user_id TEXT NOT NULL,
      status         TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      responded_at   TEXT
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_invitations_invitee_status
      ON message_invitations (invitee_user_id, status, created_at DESC)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_invitations_inviter_status
      ON message_invitations (inviter_user_id, status, created_at DESC)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS realms (
      id            TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL,
      db_name       TEXT NOT NULL,
      db_url        TEXT NOT NULL,
      created_at    TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_realms_owner_user_id
      ON realms (owner_user_id, created_at DESC)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS realm_members (
      realm_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      role      TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (realm_id, user_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_realm_members_user_id
      ON realm_members (user_id, joined_at DESC)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS realm_invitations (
      id              TEXT PRIMARY KEY,
      realm_id        TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL,
      invitee_user_id TEXT NOT NULL,
      status          TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      responded_at    TEXT
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_realm_invitations_invitee_status
      ON realm_invitations (invitee_user_id, status, created_at DESC)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_realm_invitations_realm_invitee
      ON realm_invitations (realm_id, invitee_user_id)
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
            (id, email, password_hash, created_at, db_name, db_url, db_auth_token, invited_by_user_id, session_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.email,
      user.password_hash,
      user.created_at,
      user.db_name,
      user.db_url,
      user.db_auth_token ? sealSecret(user.db_auth_token) : null,
      user.invited_by_user_id ?? null,
      Number(user.session_version || 0),
    ],
  });
}

export async function updateUserPassword(userId, passwordHash) {
  const db = await getPrimaryClient();
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
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

export async function addContactForUser(ownerUserId, email, source = "manual") {
  const contactEmail = normalizeEmail(email);
  const contactUser = await findUserByEmail(contactEmail);
  const createdAt = new Date().toISOString();
  const db = await getPrimaryClient();
  await db.execute({
    sql: `INSERT INTO contacts (id, owner_user_id, contact_email, contact_user_id, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_user_id, contact_email) DO UPDATE SET
            contact_user_id = COALESCE(excluded.contact_user_id, contacts.contact_user_id)`,
    args: [
      `con_${crypto.randomBytes(9).toString("hex")}`,
      ownerUserId,
      contactEmail,
      contactUser?.id || null,
      source,
      createdAt,
    ],
  });
  if (contactUser?.id) {
    await acceptPendingMessageInvitationsForNewContact({
      inviteeUserId: ownerUserId,
      inviterUserId: contactUser.id,
    });
  }
  return { email: contactEmail, userId: contactUser?.id || null, createdAt, source };
}

export async function listContactsForUser(ownerUserId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT contacts.id,
                 contacts.contact_email,
                 contacts.contact_user_id,
                 contacts.source,
                 contacts.created_at,
                 users.email AS registered_email
          FROM contacts
          LEFT JOIN users ON users.id = contacts.contact_user_id OR users.email = contacts.contact_email
          WHERE contacts.owner_user_id = ?
          ORDER BY contacts.created_at DESC`,
    args: [ownerUserId],
  });
  return rs.rows.map((row) => ({
    id: row.id,
    email: row.registered_email || row.contact_email,
    userId: row.contact_user_id || null,
    source: row.source,
    createdAt: row.created_at,
    registered: Boolean(row.registered_email || row.contact_user_id),
  }));
}

export async function listUsersWhoHaveUserAsContact(user) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT users.id, users.email
          FROM contacts
          INNER JOIN users ON users.id = contacts.owner_user_id
          WHERE contacts.contact_email = ? AND users.id != ?
          ORDER BY users.email ASC`,
    args: [normalizeEmail(user.email), user.id],
  });
  return rs.rows.map((row) => publicUser({ id: row.id, email: row.email, created_at: null }));
}

export async function listMessageComposeOptionsForUser(user) {
  const myContacts = await listContactsForUser(user.id);
  const registeredContacts = myContacts.filter((c) => c.userId);
  const contactIds = registeredContacts.map((c) => c.userId);
  const db = await getPrimaryClient();

  const reciprocal = new Set();
  if (contactIds.length) {
    const placeholders = contactIds.map(() => "?").join(", ");
    const rs = await db.execute({
      sql: `SELECT owner_user_id
            FROM contacts
            WHERE owner_user_id IN (${placeholders}) AND contact_email = ?`,
      args: [...contactIds, normalizeEmail(user.email)],
    });
    for (const row of rs.rows) reciprocal.add(row.owner_user_id);
  }

  const options = [];
  const byUserId = new Set();
  for (const contact of registeredContacts) {
    byUserId.add(contact.userId);
    options.push({
      userId: contact.userId,
      email: contact.email,
      relationship: reciprocal.has(contact.userId) ? "mutual" : "outgoing",
    });
  }

  const inbound = await listUsersWhoHaveUserAsContact(user);
  for (const u of inbound) {
    if (byUserId.has(u.id)) continue;
    options.push({ userId: u.id, email: u.email, relationship: "incoming" });
  }

  options.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return options;
}

async function findDirectMessageThreadId(db, userAId, userBId) {
  const rs = await db.execute({
    sql: `SELECT p1.thread_id AS thread_id
          FROM message_thread_participants AS p1
          INNER JOIN message_thread_participants AS p2
            ON p2.thread_id = p1.thread_id
          WHERE p1.user_id = ? AND p2.user_id = ?
          LIMIT 1`,
    args: [userAId, userBId],
  });
  return rs.rows[0]?.thread_id || null;
}

async function hasContactPermission(db, ownerUserId, otherEmail) {
  const rs = await db.execute({
    sql: `SELECT id FROM contacts
          WHERE owner_user_id = ? AND contact_email = ?
          LIMIT 1`,
    args: [ownerUserId, normalizeEmail(otherEmail)],
  });
  return Boolean(rs.rows[0]);
}

export async function createOrGetDirectMessageThread({ user, otherUserId }) {
  await ensurePrimarySchema();
  const db = await getPrimaryClient();
  const other = await findUserById(otherUserId);
  if (!other) return { error: "NO_USER" };
  if (other.id === user.id) return { error: "SELF" };

  const existingThreadId = await findDirectMessageThreadId(db, user.id, other.id);
  if (existingThreadId) {
    const invitation = await getMessageInvitationForThread(db, existingThreadId);
    return {
      thread: { id: existingThreadId },
      otherUser: publicUser(other),
      invitation,
    };
  }

  const otherHasMe = await hasContactPermission(db, other.id, user.email);
  const iHaveOther = await hasContactPermission(db, user.id, other.email);
  if (!otherHasMe && !iHaveOther) return { error: "CONTACT_REQUIRED" };

  const createdAt = new Date().toISOString();
  const threadId = `mth_${crypto.randomBytes(9).toString("hex")}`;
  const invitationRequired = !otherHasMe && iHaveOther;
  const statements = [
    {
      sql: `INSERT INTO message_threads (id, created_at) VALUES (?, ?)`,
      args: [threadId, createdAt],
    },
    {
      sql: `INSERT INTO message_thread_participants (thread_id, user_id, joined_at)
            VALUES (?, ?, ?)`,
      args: [threadId, user.id, createdAt],
    },
    {
      sql: `INSERT INTO message_thread_participants (thread_id, user_id, joined_at)
            VALUES (?, ?, ?)`,
      args: [threadId, other.id, createdAt],
    },
  ];

  let invitation = null;
  if (invitationRequired) {
    invitation = {
      id: `min_${crypto.randomBytes(9).toString("hex")}`,
      threadId,
      inviterUserId: user.id,
      inviteeUserId: other.id,
      status: "pending",
      createdAt,
      respondedAt: null,
    };
    statements.push({
      sql: `INSERT INTO message_invitations
              (id, thread_id, inviter_user_id, invitee_user_id, status, created_at, responded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        invitation.id,
        invitation.threadId,
        invitation.inviterUserId,
        invitation.inviteeUserId,
        invitation.status,
        invitation.createdAt,
        invitation.respondedAt,
      ],
    });
  }

  await db.batch(statements, "write");

  return {
    thread: { id: threadId },
    otherUser: publicUser(other),
    invitation,
  };
}

async function getMessageInvitationForThread(db, threadId) {
  const rs = await db.execute({
    sql: `SELECT * FROM message_invitations WHERE thread_id = ? LIMIT 1`,
    args: [threadId],
  });
  const row = rs.rows[0] || null;
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    inviterUserId: row.inviter_user_id,
    inviteeUserId: row.invitee_user_id,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at || null,
  };
}

export async function listMessageInboxForUser(user) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT
            threads.id AS thread_id,
            threads.created_at AS thread_created_at,
            other.id AS other_user_id,
            other.email AS other_email,
            inv.id AS invitation_id,
            inv.status AS invitation_status,
            inv.inviter_user_id AS invitation_inviter_user_id,
            inv.invitee_user_id AS invitation_invitee_user_id,
            last.body AS last_body,
            last.created_at AS last_created_at
          FROM message_threads AS threads
          INNER JOIN message_thread_participants AS selfp
            ON selfp.thread_id = threads.id AND selfp.user_id = ?
          INNER JOIN message_thread_participants AS otherp
            ON otherp.thread_id = threads.id AND otherp.user_id != ?
          INNER JOIN users AS other
            ON other.id = otherp.user_id
          LEFT JOIN message_invitations AS inv
            ON inv.thread_id = threads.id
          LEFT JOIN messages AS last
            ON last.id = (
              SELECT id
              FROM messages
              WHERE thread_id = threads.id
              ORDER BY created_at DESC
              LIMIT 1
            )
          ORDER BY COALESCE(last.created_at, threads.created_at) DESC`,
    args: [user.id, user.id],
  });

  const threads = [];
  const invitations = [];
  for (const row of rs.rows) {
    const invitation =
      row.invitation_id
        ? {
            id: row.invitation_id,
            threadId: row.thread_id,
            inviterUserId: row.invitation_inviter_user_id,
            inviteeUserId: row.invitation_invitee_user_id,
            status: row.invitation_status,
          }
        : null;

    const summary = {
      id: row.thread_id,
      otherUser: { id: row.other_user_id, email: row.other_email },
      lastMessage: row.last_body
        ? { body: row.last_body, createdAt: row.last_created_at }
        : null,
      invitation,
      createdAt: row.thread_created_at,
    };

    if (invitation?.status === "pending" && invitation.inviteeUserId === user.id) {
      invitations.push(summary);
    } else {
      threads.push(summary);
    }
  }

  const composeOptions = await listMessageComposeOptionsForUser(user);
  return { viewerUserId: user.id, viewerEmail: user.email, threads, invitations, composeOptions };
}

async function ensureUserInThread(db, userId, threadId) {
  const rs = await db.execute({
    sql: `SELECT thread_id FROM message_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1`,
    args: [threadId, userId],
  });
  return Boolean(rs.rows[0]);
}

export async function getMessageThreadForUser({ user, threadId, limit = 200 }) {
  const db = await getPrimaryClient();
  const ok = await ensureUserInThread(db, user.id, threadId);
  if (!ok) return null;

  const invitation = await getMessageInvitationForThread(db, threadId);
  const otherRs = await db.execute({
    sql: `SELECT users.id, users.email
          FROM message_thread_participants
          INNER JOIN users ON users.id = message_thread_participants.user_id
          WHERE message_thread_participants.thread_id = ? AND users.id != ?
          LIMIT 1`,
    args: [threadId, user.id],
  });
  const other = otherRs.rows[0] || null;
  if (!other) return null;

  const canSend =
    !invitation ||
    invitation.status === "accepted" ||
    (invitation.status === "pending" && invitation.inviterUserId === user.id);

  const messagesRs = await db.execute({
    sql: `SELECT messages.id, messages.body, messages.sender_user_id, messages.created_at, sender.email AS sender_email
          FROM messages
          INNER JOIN users AS sender ON sender.id = messages.sender_user_id
          WHERE messages.thread_id = ?
          ORDER BY messages.created_at ASC
          LIMIT ?`,
    args: [threadId, Math.max(1, Math.min(500, Number(limit) || 200))],
  });

  const messages = messagesRs.rows.map((row) => ({
    id: row.id,
    body: row.body,
    senderUserId: row.sender_user_id,
    senderEmail: row.sender_email || null,
    createdAt: row.created_at,
  }));

  return {
    viewerUserId: user.id,
    viewerEmail: user.email,
    thread: { id: threadId, otherUser: { id: other.id, email: other.email } },
    invitation,
    canSend,
    messages,
  };
}

export async function sendMessageInThread({ user, threadId, body }) {
  const text = String(body || "").trim();
  if (!text) return { error: "EMPTY" };
  if (text.length > 4000) return { error: "TOO_LONG" };

  const db = await getPrimaryClient();
  const ok = await ensureUserInThread(db, user.id, threadId);
  if (!ok) return { error: "NOT_FOUND" };

  const invitation = await getMessageInvitationForThread(db, threadId);
  if (invitation?.status === "declined") return { error: "INVITATION_DECLINED" };
  if (invitation?.status === "pending" && invitation.inviterUserId !== user.id) return { error: "INVITATION_PENDING" };

  const createdAt = new Date().toISOString();
  const msg = {
    id: `msg_${crypto.randomBytes(9).toString("hex")}`,
    thread_id: threadId,
    sender_user_id: user.id,
    body: text,
    created_at: createdAt,
  };
  await db.execute({
    sql: `INSERT INTO messages (id, thread_id, sender_user_id, body, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [msg.id, msg.thread_id, msg.sender_user_id, msg.body, msg.created_at],
  });
  return { message: { id: msg.id, body: msg.body, senderUserId: msg.sender_user_id, createdAt: msg.created_at } };
}

export async function respondToMessageInvitation({ user, invitationId, action }) {
  const db = await getPrimaryClient();
  const status = action === "accept" ? "accepted" : "declined";
  const respondedAt = new Date().toISOString();
  const rs = await db.execute({
    sql: `SELECT * FROM message_invitations
          WHERE id = ? AND invitee_user_id = ? AND status = 'pending'
          LIMIT 1`,
    args: [invitationId, user.id],
  });
  const invitation = rs.rows[0] || null;
  if (!invitation) return null;

  const statements = [
    {
      sql: `UPDATE message_invitations SET status = ?, responded_at = ? WHERE id = ?`,
      args: [status, respondedAt, invitationId],
    },
  ];
  if (status === "accepted") {
    const inviter = await findUserById(invitation.inviter_user_id);
    if (inviter) {
      statements.push({
        sql: `INSERT INTO contacts (id, owner_user_id, contact_email, contact_user_id, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(owner_user_id, contact_email) DO UPDATE SET
                contact_user_id = COALESCE(excluded.contact_user_id, contacts.contact_user_id)`,
        args: [
          `con_${crypto.randomBytes(9).toString("hex")}`,
          user.id,
          normalizeEmail(inviter.email),
          inviter.id,
          "message_accept",
          respondedAt,
        ],
      });
    }
  }
  await db.batch(statements, "write");
  return {
    id: invitation.id,
    threadId: invitation.thread_id,
    inviterUserId: invitation.inviter_user_id,
    inviteeUserId: invitation.invitee_user_id,
    status,
    createdAt: invitation.created_at,
    respondedAt,
  };
}

export async function acceptPendingMessageInvitationsForNewContact({ inviteeUserId, inviterUserId }) {
  const db = await getPrimaryClient();
  const respondedAt = new Date().toISOString();
  await db.execute({
    sql: `UPDATE message_invitations
          SET status = 'accepted', responded_at = ?
          WHERE invitee_user_id = ? AND inviter_user_id = ? AND status = 'pending'`,
    args: [respondedAt, inviteeUserId, inviterUserId],
  });
}

export async function listRealmInviteOptionsForUser(user) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT users.id, users.email
          FROM contacts
          INNER JOIN users ON users.id = contacts.owner_user_id
          WHERE contacts.contact_email = ? AND users.id != ?
          ORDER BY users.email ASC`,
    args: [normalizeEmail(user.email), user.id],
  });
  return rs.rows.map((row) => publicUser({ id: row.id, email: row.email, created_at: null }));
}

export async function insertRealm(realm) {
  const db = await getPrimaryClient();
  await db.batch(
    [
      {
        sql: `INSERT INTO realms (id, owner_user_id, title, description, db_name, db_url, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          realm.id,
          realm.owner_user_id,
          realm.title,
          realm.description,
          realm.db_name,
          realm.db_url,
          realm.created_at,
        ],
      },
      {
        sql: `INSERT INTO realm_members (realm_id, user_id, role, joined_at)
              VALUES (?, ?, 'owner', ?)`,
        args: [realm.id, realm.owner_user_id, realm.created_at],
      },
    ],
    "write"
  );
}

export async function listRealmsForUser(userId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT realms.*,
                 realm_members.role,
                 realm_members.joined_at,
                 owners.email AS owner_email,
                 (SELECT COUNT(*) FROM realm_members WHERE realm_members.realm_id = realms.id) AS member_count
          FROM realm_members
          INNER JOIN realms ON realms.id = realm_members.realm_id
          INNER JOIN users AS owners ON owners.id = realms.owner_user_id
          WHERE realm_members.user_id = ?
          ORDER BY realms.created_at DESC`,
    args: [userId],
  });
  return rs.rows.map(publicRealm);
}

export async function findRealmById(realmId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT realms.*, owners.email AS owner_email
          FROM realms
          INNER JOIN users AS owners ON owners.id = realms.owner_user_id
          WHERE realms.id = ?
          LIMIT 1`,
    args: [realmId],
  });
  return rs.rows[0] || null;
}

export async function createRealmInvitation({ realm, inviterUser, inviteeEmail }) {
  const normalizedEmail = normalizeEmail(inviteeEmail);
  const invitee = await findUserByEmail(normalizedEmail);
  if (!invitee) return { error: "NO_USER" };
  if (invitee.id === inviterUser.id) return { error: "SELF" };

  const db = await getPrimaryClient();
  const permission = await db.execute({
    sql: `SELECT id FROM contacts
          WHERE owner_user_id = ? AND contact_email = ?
          LIMIT 1`,
    args: [invitee.id, normalizeEmail(inviterUser.email)],
  });
  if (!permission.rows[0]) return { error: "CONTACT_REQUIRED", invitee };

  const existingMember = await db.execute({
    sql: "SELECT user_id FROM realm_members WHERE realm_id = ? AND user_id = ? LIMIT 1",
    args: [realm.id, invitee.id],
  });
  if (existingMember.rows[0]) return { error: "ALREADY_MEMBER", invitee };

  const existingPending = await db.execute({
    sql: `SELECT realm_invitations.*, invitee.email AS invitee_email, inviter.email AS inviter_email, realms.title AS realm_title
          FROM realm_invitations
          INNER JOIN users AS invitee ON invitee.id = realm_invitations.invitee_user_id
          INNER JOIN users AS inviter ON inviter.id = realm_invitations.inviter_user_id
          INNER JOIN realms ON realms.id = realm_invitations.realm_id
          WHERE realm_id = ? AND invitee_user_id = ? AND status = 'pending'
          LIMIT 1`,
    args: [realm.id, invitee.id],
  });
  if (existingPending.rows[0]) return { invitation: publicRealmInvitation(existingPending.rows[0]), invitee };

  const invitation = {
    id: `rin_${crypto.randomBytes(9).toString("hex")}`,
    realm_id: realm.id,
    inviter_user_id: inviterUser.id,
    invitee_user_id: invitee.id,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  await db.execute({
    sql: `INSERT INTO realm_invitations
            (id, realm_id, inviter_user_id, invitee_user_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      invitation.id,
      invitation.realm_id,
      invitation.inviter_user_id,
      invitation.invitee_user_id,
      invitation.status,
      invitation.created_at,
    ],
  });

  return {
    invitation: publicRealmInvitation({
      ...invitation,
      invitee_email: invitee.email,
      inviter_email: inviterUser.email,
      realm_title: realm.title,
    }),
    invitee,
  };
}

export async function listPendingRealmInvitations(userId) {
  const db = await getPrimaryClient();
  const rs = await db.execute({
    sql: `SELECT realm_invitations.*,
                 realms.title AS realm_title,
                 realms.description AS realm_description,
                 inviter.email AS inviter_email,
                 invitee.email AS invitee_email
          FROM realm_invitations
          INNER JOIN realms ON realms.id = realm_invitations.realm_id
          INNER JOIN users AS inviter ON inviter.id = realm_invitations.inviter_user_id
          INNER JOIN users AS invitee ON invitee.id = realm_invitations.invitee_user_id
          WHERE realm_invitations.invitee_user_id = ? AND realm_invitations.status = 'pending'
          ORDER BY realm_invitations.created_at DESC`,
    args: [userId],
  });
  return rs.rows.map(publicRealmInvitation);
}

export async function respondToRealmInvitation({ invitationId, userId, action }) {
  const db = await getPrimaryClient();
  const status = action === "accept" ? "accepted" : "declined";
  const respondedAt = new Date().toISOString();
  const rs = await db.execute({
    sql: `SELECT realm_invitations.*, realms.title AS realm_title, realms.description AS realm_description,
                 realms.db_name, realms.db_url, realms.owner_user_id, inviter.email AS inviter_email,
                 invitee.email AS invitee_email
          FROM realm_invitations
          INNER JOIN realms ON realms.id = realm_invitations.realm_id
          INNER JOIN users AS inviter ON inviter.id = realm_invitations.inviter_user_id
          INNER JOIN users AS invitee ON invitee.id = realm_invitations.invitee_user_id
          WHERE realm_invitations.id = ? AND realm_invitations.invitee_user_id = ? AND realm_invitations.status = 'pending'
          LIMIT 1`,
    args: [invitationId, userId],
  });
  const invitation = rs.rows[0] || null;
  if (!invitation) return null;

  const statements = [
    {
      sql: "UPDATE realm_invitations SET status = ?, responded_at = ? WHERE id = ?",
      args: [status, respondedAt, invitationId],
    },
  ];
  if (status === "accepted") {
    statements.push({
      sql: `INSERT INTO realm_members (realm_id, user_id, role, joined_at)
            VALUES (?, ?, 'member', ?)
            ON CONFLICT(realm_id, user_id) DO NOTHING`,
      args: [invitation.realm_id, userId, respondedAt],
    });
  }
  await db.batch(statements, "write");
  return publicRealmInvitation({ ...invitation, status, responded_at: respondedAt });
}

// Shape a user row for safe return to clients (never leak secrets).
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function publicInviteCode(row) {
  return {
    code: row.code,
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
  };
}

export function publicRealm(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    ownerUserId: row.owner_user_id,
    ownerEmail: row.owner_email || null,
    role: row.role || (row.owner_user_id ? "owner" : "member"),
    memberCount: Number(row.member_count || 1),
    createdAt: row.created_at,
    joinedAt: row.joined_at || row.created_at,
  };
}

export function publicRealmInvitation(row) {
  return {
    id: row.id,
    realmId: row.realm_id,
    realmTitle: row.realm_title || null,
    realmDescription: row.realm_description || "",
    inviterEmail: row.inviter_email || null,
    inviteeEmail: row.invitee_email || null,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at || null,
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
    actorEmail: row.actor_email || null,
    inviteCode: row.invite_code || null,
    metadata,
  };
}
