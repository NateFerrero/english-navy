// Realm content: words/phrases, forkable definitions, continuous picks,
// structured argument maps, thread collapse, and definition history.
//
// Lives in each Realm's own database. There are no timers or voting windows;
// inactivity is a system-level cutoff used only when checking who must still
// agree to collapse a side thread.

import crypto from "node:crypto";
import { getConnectionClient } from "./db.mjs";
import { findRealmById, findRealmMembership, findUsersByIds } from "./primary.mjs";
import { mintDatabaseToken } from "./provisioner.mjs";
import { getProfile, getUserRealmAccess, grantRealmAccess } from "./userdb.mjs";

export const THREAD_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_CLARIFIER = "General";
export const MAX_NAME_LENGTH = 80;
export const MAX_CLARIFIER_LENGTH = 80;
export const MAX_DEFINITION_LENGTH = 4000;
export const MAX_ARGUMENT_LENGTH = 2000;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function nowIso(now) {
  return (now instanceof Date ? now : new Date()).toISOString();
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function keyOf(value) {
  return cleanText(value, 400).toLowerCase();
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function isParticipantActive(user, now = new Date(), inactivityMs = THREAD_INACTIVITY_MS) {
  if (!user) return false;
  const last = user.last_seen_at || user.lastSeenAt || user.created_at || user.createdAt;
  if (!last) return false;
  return now.getTime() - new Date(last).getTime() < inactivityMs;
}

export function currentDefinitionsFrom(definitions) {
  if (!definitions.length) return [];
  const max = Math.max(...definitions.map((item) => Number(item.pickCount || 0)));
  return definitions.filter((item) => Number(item.pickCount || 0) === max);
}

function publicWord(row) {
  return {
    id: row.id,
    name: row.name,
    clarifier: row.clarifier,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

function publicDefinition(row, extras = {}) {
  return {
    id: row.id,
    wordId: row.word_id,
    body: row.body,
    forkedFromId: row.forked_from_id || null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    pickCount: Number(row.pick_count || extras.pickCount || 0),
    current: Boolean(extras.current),
    ...extras,
  };
}

function publicMessage(row, extras = {}) {
  return {
    id: row.id,
    definitionId: row.definition_id,
    parentId: row.parent_id || null,
    threadId: row.thread_id || null,
    body: row.body,
    authorUserId: row.author_user_id,
    kind: row.kind || "argument",
    collapsed: Boolean(Number(row.collapsed || 0)),
    collapsedIntoId: row.collapsed_into_id || null,
    createdAt: row.created_at,
    ...extras,
  };
}

function publicHistory(row) {
  return {
    id: row.id,
    wordId: row.word_id,
    eventType: row.event_type,
    definitionId: row.definition_id || null,
    actorUserId: row.actor_user_id || null,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
  };
}

export async function ensureRealmContentSchema(connection) {
  const db = await getConnectionClient(connection);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS realm_metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS words (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      name_key           TEXT NOT NULL,
      clarifier          TEXT NOT NULL,
      clarifier_key      TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at         TEXT NOT NULL,
      UNIQUE(name_key, clarifier_key)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS definitions (
      id                 TEXT PRIMARY KEY,
      word_id            TEXT NOT NULL,
      body               TEXT NOT NULL,
      forked_from_id     TEXT,
      created_by_user_id TEXT NOT NULL,
      created_at         TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_definitions_word_id
      ON definitions (word_id, created_at)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS picks (
      word_id       TEXT NOT NULL,
      user_id       TEXT NOT NULL,
      definition_id TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      PRIMARY KEY (word_id, user_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_picks_definition_id
      ON picks (definition_id)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sam_messages (
      id                 TEXT PRIMARY KEY,
      definition_id      TEXT NOT NULL,
      parent_id          TEXT,
      thread_id          TEXT,
      body               TEXT NOT NULL,
      author_user_id     TEXT NOT NULL,
      kind               TEXT NOT NULL DEFAULT 'argument',
      collapsed          INTEGER NOT NULL DEFAULT 0,
      collapsed_into_id  TEXT,
      created_at         TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sam_definition_created
      ON sam_messages (definition_id, created_at)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sam_thread_id
      ON sam_messages (thread_id)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS thread_resolutions (
      thread_id            TEXT PRIMARY KEY,
      proposed_by_user_id  TEXT NOT NULL,
      consensus_body       TEXT NOT NULL,
      status               TEXT NOT NULL,
      created_at           TEXT NOT NULL,
      resolved_at          TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS thread_resolution_agreements (
      thread_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      agreed     INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, user_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS definition_history (
      id            TEXT PRIMARY KEY,
      word_id       TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      definition_id TEXT,
      actor_user_id TEXT,
      metadata      TEXT,
      created_at    TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_definition_history_word
      ON definition_history (word_id, created_at DESC)
  `);
  return db;
}

export async function openRealmForMember(user, realmId) {
  const membership = await findRealmMembership(realmId, user.id);
  if (!membership) return { error: "NOT_MEMBER" };
  const realm = await findRealmById(realmId);
  if (!realm) return { error: "NOT_FOUND" };

  let access = await getUserRealmAccess(user, realmId);
  if (!access) {
    const token = await mintDatabaseToken(realm.db_name);
    await grantRealmAccess(user, {
      realmId: realm.id,
      dbUrl: realm.db_url,
      dbAuthToken: token,
    });
    access = await getUserRealmAccess(user, realmId);
  }

  const connection = {
    db_url: access?.db_url || realm.db_url,
    db_auth_token: access?.db_auth_token || null,
  };
  const db = await ensureRealmContentSchema(connection);
  return { db, realm, membership, connection };
}

async function actorLabel(user) {
  try {
    const profile = await getProfile(user);
    const name = String(profile.display_name || "").trim();
    if (name) return name;
  } catch {
    /* fall through */
  }
  return String(user.email || "Someone").split("@")[0];
}

async function usersById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await findUsersByIds(unique);
  return new Map(rows.map((row) => [row.id, row]));
}

async function recordHistory(db, { wordId, eventType, definitionId = null, actorUserId = null, metadata = null, createdAt }) {
  await db.execute({
    sql: `INSERT INTO definition_history
            (id, word_id, event_type, definition_id, actor_user_id, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      newId("his"),
      wordId,
      eventType,
      definitionId,
      actorUserId,
      metadata ? JSON.stringify(metadata) : null,
      createdAt,
    ],
  });
}

async function loadDefinitionsForWord(db, wordId) {
  const defs = await db.execute({
    sql: `SELECT definitions.*,
                 (SELECT COUNT(*) FROM picks WHERE picks.definition_id = definitions.id) AS pick_count
          FROM definitions
          WHERE definitions.word_id = ?
          ORDER BY definitions.created_at ASC`,
    args: [wordId],
  });
  return defs.rows;
}

async function myPickId(db, wordId, userId) {
  if (!userId) return null;
  const rs = await db.execute({
    sql: "SELECT definition_id FROM picks WHERE word_id = ? AND user_id = ? LIMIT 1",
    args: [wordId, userId],
  });
  return rs.rows[0]?.definition_id || null;
}

function decorateDefinitions(rows, pickedId = null) {
  const definitions = rows.map((row) =>
    publicDefinition(row, { pickCount: Number(row.pick_count || 0), myPick: row.id === pickedId })
  );
  const current = currentDefinitionsFrom(definitions);
  const currentIds = new Set(current.map((item) => item.id));
  for (const definition of definitions) definition.current = currentIds.has(definition.id);
  return { definitions, currentDefinitions: current };
}

async function wordBundle(db, wordRow, userId) {
  const pickedId = await myPickId(db, wordRow.id, userId);
  const { definitions, currentDefinitions } = decorateDefinitions(await loadDefinitionsForWord(db, wordRow.id), pickedId);
  return {
    word: publicWord(wordRow),
    definitions,
    currentDefinitions,
    alternativeDefinitions: definitions.filter((item) => !item.current),
    myPickId: pickedId,
  };
}

export async function listWords(db, { userId } = {}) {
  const rs = await db.execute("SELECT * FROM words ORDER BY name_key ASC, clarifier_key ASC");
  const words = [];
  for (const row of rs.rows) {
    const bundle = await wordBundle(db, row, userId);
    const preview = bundle.currentDefinitions[0] || null;
    words.push({
      ...bundle.word,
      currentDefinitions: bundle.currentDefinitions,
      previewBody: preview?.body || "",
      myPickId: bundle.myPickId,
    });
  }
  return { words };
}

export async function getWord(db, { wordId, userId }) {
  const rs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [wordId] });
  const word = rs.rows[0];
  if (!word) return { error: "WORD_NOT_FOUND" };
  return wordBundle(db, word, userId);
}

export async function createWord(db, { user, name, clarifier, definition, now = new Date(), notify }) {
  const cleanName = cleanText(name, MAX_NAME_LENGTH);
  const cleanClarifier = cleanText(clarifier, MAX_CLARIFIER_LENGTH) || DEFAULT_CLARIFIER;
  const body = cleanText(definition, MAX_DEFINITION_LENGTH);
  if (!cleanName) return { error: "NAME_REQUIRED" };
  if (!body) return { error: "DEFINITION_REQUIRED" };

  const createdAt = nowIso(now);
  const wordId = newId("wrd");
  const definitionId = newId("def");
  try {
    await db.batch(
      [
        {
          sql: `INSERT INTO words (id, name, name_key, clarifier, clarifier_key, created_by_user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [wordId, cleanName, keyOf(cleanName), cleanClarifier, keyOf(cleanClarifier), user.id, createdAt],
        },
        {
          sql: `INSERT INTO definitions (id, word_id, body, forked_from_id, created_by_user_id, created_at)
                VALUES (?, ?, ?, NULL, ?, ?)`,
          args: [definitionId, wordId, body, user.id, createdAt],
        },
        {
          sql: `INSERT INTO picks (word_id, user_id, definition_id, updated_at)
                VALUES (?, ?, ?, ?)`,
          args: [wordId, user.id, definitionId, createdAt],
        },
      ],
      "write"
    );
  } catch (err) {
    if (String(err.message || err).includes("UNIQUE")) return { error: "WORD_EXISTS" };
    throw err;
  }

  await recordHistory(db, {
    wordId,
    eventType: "word_created",
    definitionId,
    actorUserId: user.id,
    metadata: { name: cleanName, clarifier: cleanClarifier, body },
    createdAt,
  });
  await recordHistory(db, {
    wordId,
    eventType: "definition_created",
    definitionId,
    actorUserId: user.id,
    metadata: { name: cleanName, clarifier: cleanClarifier, body, snapshot: body },
    createdAt,
  });
  if (notify) {
    /* creator already knows */
  }
  return getWord(db, { wordId, userId: user.id });
}

export async function createDefinition(db, { user, wordId, body, forkedFromId = null, now = new Date(), notify }) {
  const wordRs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [wordId] });
  const word = wordRs.rows[0];
  if (!word) return { error: "WORD_NOT_FOUND" };
  const cleanBody = cleanText(body, MAX_DEFINITION_LENGTH);
  if (!cleanBody) return { error: "DEFINITION_REQUIRED" };

  let source = null;
  if (forkedFromId) {
    const sourceRs = await db.execute({
      sql: "SELECT * FROM definitions WHERE id = ? AND word_id = ? LIMIT 1",
      args: [forkedFromId, wordId],
    });
    source = sourceRs.rows[0];
    if (!source) return { error: "DEFINITION_NOT_FOUND" };
  }

  const createdAt = nowIso(now);
  const definitionId = newId("def");
  await db.execute({
    sql: `INSERT INTO definitions (id, word_id, body, forked_from_id, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [definitionId, wordId, cleanBody, forkedFromId, user.id, createdAt],
  });

  const eventType = forkedFromId ? "definition_forked" : "definition_created";
  await recordHistory(db, {
    wordId,
    eventType,
    definitionId,
    actorUserId: user.id,
    metadata: {
      name: word.name,
      clarifier: word.clarifier,
      body: cleanBody,
      snapshot: cleanBody,
      forkedFromId,
    },
    createdAt,
  });

  if (forkedFromId && source && source.created_by_user_id !== user.id && notify) {
    const label = await actorLabel(user);
    await notify({
      userId: source.created_by_user_id,
      eventType: "definition_forked",
      body: `${label} forked your definition for ${word.name} (${word.clarifier}).`,
      metadata: { realmWord: word.name, clarifier: word.clarifier, wordId, definitionId, forkedFromId },
    });
  }

  return getWord(db, { wordId, userId: user.id });
}

export async function forkDefinition(db, { user, definitionId, body, now = new Date(), notify }) {
  const rs = await db.execute({ sql: "SELECT * FROM definitions WHERE id = ? LIMIT 1", args: [definitionId] });
  const source = rs.rows[0];
  if (!source) return { error: "DEFINITION_NOT_FOUND" };
  return createDefinition(db, {
    user,
    wordId: source.word_id,
    body: body == null || body === "" ? source.body : body,
    forkedFromId: source.id,
    now,
    notify,
  });
}

export async function pickDefinition(db, { user, wordId, definitionId, now = new Date(), notify }) {
  const before = await getWord(db, { wordId, userId: user.id });
  if (before.error) return before;
  const target = before.definitions.find((item) => item.id === definitionId);
  if (!target) return { error: "DEFINITION_NOT_FOUND" };

  const createdAt = nowIso(now);
  await db.execute({
    sql: `INSERT INTO picks (word_id, user_id, definition_id, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(word_id, user_id) DO UPDATE SET
            definition_id = excluded.definition_id,
            updated_at = excluded.updated_at`,
    args: [wordId, user.id, definitionId, createdAt],
  });

  const after = await getWord(db, { wordId, userId: user.id });
  await recordHistory(db, {
    wordId,
    eventType: "pick_changed",
    definitionId,
    actorUserId: user.id,
    metadata: {
      name: after.word.name,
      clarifier: after.word.clarifier,
      snapshot: target.body,
      previousDefinitionId: before.myPickId,
    },
    createdAt,
  });

  const beforeIds = before.currentDefinitions.map((item) => item.id).sort().join(",");
  const afterIds = after.currentDefinitions.map((item) => item.id).sort().join(",");
  if (beforeIds !== afterIds) {
    await recordHistory(db, {
      wordId,
      eventType: "consensus_changed",
      definitionId,
      actorUserId: user.id,
      metadata: {
        name: after.word.name,
        clarifier: after.word.clarifier,
        snapshot: after.currentDefinitions.map((item) => item.body).join("\n\n"),
        currentDefinitionIds: after.currentDefinitions.map((item) => item.id),
      },
      createdAt,
    });
  }

  const becameTie = after.currentDefinitions.length > 1 && before.currentDefinitions.length <= 1;
  if (becameTie && notify) {
    const authors = new Set(
      after.currentDefinitions.map((item) => item.createdByUserId).filter((id) => id && id !== user.id)
    );
    for (const userId of authors) {
      await notify({
        userId,
        eventType: "definition_tied",
        body: `Your definition is now tied for the Current Definition for ${after.word.name} (${after.word.clarifier}).`,
        metadata: { wordId, name: after.word.name, clarifier: after.word.clarifier },
      });
    }
  }

  return after;
}

async function loadMessages(db, definitionId) {
  const rs = await db.execute({
    sql: "SELECT * FROM sam_messages WHERE definition_id = ? ORDER BY created_at ASC",
    args: [definitionId],
  });
  return rs.rows;
}

function descendantIds(messages, rootId) {
  const byParent = new Map();
  for (const message of messages) {
    const key = message.parent_id || "";
    const list = byParent.get(key) || [];
    list.push(message);
    byParent.set(key, list);
  }
  const out = [];
  const stack = [rootId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of byParent.get(id) || []) stack.push(child.id);
  }
  return out;
}

async function activeParticipants(db, { threadId, realmId, now = new Date() }) {
  const rs = await db.execute({
    sql: "SELECT DISTINCT author_user_id FROM sam_messages WHERE thread_id = ? AND collapsed = 0",
    args: [threadId],
  });
  const ids = rs.rows.map((row) => row.author_user_id);
  const users = await usersById(ids);
  const active = [];
  for (const id of ids) {
    const user = users.get(id);
    if (!user) continue;
    const membership = await findRealmMembership(realmId, id);
    if (!membership) continue;
    if (!isParticipantActive(user, now)) continue;
    active.push(id);
  }
  return { participantIds: ids, activeIds: active, users };
}

async function getResolution(db, threadId) {
  const rs = await db.execute({
    sql: "SELECT * FROM thread_resolutions WHERE thread_id = ? LIMIT 1",
    args: [threadId],
  });
  const row = rs.rows[0];
  if (!row) return null;
  const agreements = await db.execute({
    sql: "SELECT * FROM thread_resolution_agreements WHERE thread_id = ?",
    args: [threadId],
  });
  return {
    threadId: row.thread_id,
    proposedByUserId: row.proposed_by_user_id,
    consensusBody: row.consensus_body,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
    agreements: agreements.rows.map((item) => ({
      userId: item.user_id,
      agreed: Boolean(Number(item.agreed)),
      updatedAt: item.updated_at,
    })),
  };
}

async function collapseThread(db, { threadId, consensusBody, actor, word, definition, realmId, now, notify }) {
  const messages = await loadMessages(db, definition.id);
  const root = messages.find((item) => item.id === threadId);
  if (!root) return { error: "THREAD_NOT_FOUND" };
  const parent = messages.find((item) => item.id === root.parent_id) || null;
  const createdAt = nowIso(now);
  const consensusId = newId("sam");
  const ids = descendantIds(messages, threadId);
  const statements = [
    {
      sql: `INSERT INTO sam_messages
              (id, definition_id, parent_id, thread_id, body, author_user_id, kind, collapsed, collapsed_into_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'consensus', 0, NULL, ?)`,
      args: [
        consensusId,
        definition.id,
        root.parent_id,
        parent?.thread_id || null,
        consensusBody,
        actor.id,
        createdAt,
      ],
    },
  ];
  for (const id of ids) {
    statements.push({
      sql: "UPDATE sam_messages SET collapsed = 1, collapsed_into_id = ? WHERE id = ?",
      args: [consensusId, id],
    });
  }
  statements.push({
    sql: "UPDATE thread_resolutions SET status = 'resolved', resolved_at = ? WHERE thread_id = ?",
    args: [createdAt, threadId],
  });
  await db.batch(statements, "write");

  await recordHistory(db, {
    wordId: word.id,
    eventType: "thread_collapsed",
    definitionId: definition.id,
    actorUserId: actor.id,
    metadata: {
      name: word.name,
      clarifier: word.clarifier,
      snapshot: consensusBody,
      threadId,
      consensusId,
    },
    createdAt,
  });

  if (notify) {
    const authors = new Set(messages.filter((item) => ids.includes(item.id)).map((item) => item.author_user_id));
    authors.delete(actor.id);
    for (const userId of authors) {
      await notify({
        userId,
        eventType: "thread_collapsed",
        body: "A thread you participated in has been resolved and collapsed.",
        metadata: {
          wordId: word.id,
          definitionId: definition.id,
          threadId,
          consensusId,
          name: word.name,
          clarifier: word.clarifier,
        },
      });
    }
  }

  return { consensusId };
}

export async function getDefinition(db, { definitionId, userId, realmId, now = new Date() }) {
  const defRs = await db.execute({ sql: "SELECT * FROM definitions WHERE id = ? LIMIT 1", args: [definitionId] });
  const definitionRow = defRs.rows[0];
  if (!definitionRow) return { error: "DEFINITION_NOT_FOUND" };
  const wordRs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [definitionRow.word_id] });
  const word = wordRs.rows[0];
  const bundle = await wordBundle(db, word, userId);
  const definition = bundle.definitions.find((item) => item.id === definitionId);
  const messageRows = await loadMessages(db, definitionId);
  const live = messageRows.filter((row) => !Number(row.collapsed));
  const authorIds = live.map((row) => row.author_user_id);
  const authors = await usersById(authorIds);

  const threadIds = [...new Set(live.map((row) => row.thread_id).filter(Boolean))];
  const resolutions = {};
  for (const threadId of threadIds) {
    const resolution = await getResolution(db, threadId);
    const { activeIds, participantIds } = await activeParticipants(db, { threadId, realmId, now });
    const agreedIds = new Set((resolution?.agreements || []).filter((item) => item.agreed).map((item) => item.userId));
    resolutions[threadId] = {
      ...(resolution || { threadId, status: "none", consensusBody: "", agreements: [] }),
      participantIds,
      activeIds,
      missingIds: activeIds.filter((id) => !agreedIds.has(id)),
      canResolve: Boolean(userId && activeIds.includes(userId)),
    };
  }

  const messages = live.map((row) => {
    const author = authors.get(row.author_user_id);
    return publicMessage(row, {
      authorEmail: author?.email || null,
      authorName: author ? String(author.email || "").split("@")[0] : "Unknown",
      isSideThreadRoot: Boolean(row.thread_id && row.thread_id === row.id),
    });
  });

  return {
    word: bundle.word,
    definition,
    definitions: bundle.definitions,
    currentDefinitions: bundle.currentDefinitions,
    myPickId: bundle.myPickId,
    messages,
    resolutions,
  };
}

async function getDefinitionContext(db, definitionId) {
  const defRs = await db.execute({ sql: "SELECT * FROM definitions WHERE id = ? LIMIT 1", args: [definitionId] });
  const definition = defRs.rows[0];
  if (!definition) return { error: "DEFINITION_NOT_FOUND" };
  const wordRs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [definition.word_id] });
  return { definition: publicDefinition(definition), word: publicWord(wordRs.rows[0]), definitionRow: definition, wordRow: wordRs.rows[0] };
}

export async function addArgument(db, { user, definitionId, body, now = new Date() }) {
  const ctx = await getDefinitionContext(db, definitionId);
  if (ctx.error) return ctx;
  const cleanBody = cleanText(body, MAX_ARGUMENT_LENGTH);
  if (!cleanBody) return { error: "EMPTY_MESSAGE" };
  const createdAt = nowIso(now);
  const id = newId("sam");
  await db.execute({
    sql: `INSERT INTO sam_messages
            (id, definition_id, parent_id, thread_id, body, author_user_id, kind, collapsed, collapsed_into_id, created_at)
          VALUES (?, ?, NULL, NULL, ?, ?, 'argument', 0, NULL, ?)`,
    args: [id, definitionId, cleanBody, user.id, createdAt],
  });
  return { id };
}

export async function startBranch(db, { user, parentId, body, now = new Date() }) {
  const parentRs = await db.execute({ sql: "SELECT * FROM sam_messages WHERE id = ? LIMIT 1", args: [parentId] });
  const parent = parentRs.rows[0];
  if (!parent || Number(parent.collapsed)) return { error: "MESSAGE_NOT_FOUND" };
  const cleanBody = cleanText(body, MAX_ARGUMENT_LENGTH);
  if (!cleanBody) return { error: "EMPTY_MESSAGE" };
  const createdAt = nowIso(now);
  const id = newId("sam");
  await db.execute({
    sql: `INSERT INTO sam_messages
            (id, definition_id, parent_id, thread_id, body, author_user_id, kind, collapsed, collapsed_into_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'argument', 0, NULL, ?)`,
    args: [id, parent.definition_id, parent.id, id, cleanBody, user.id, createdAt],
  });
  return { id, threadId: id };
}

export async function replyInThread(db, { user, parentId, body, now = new Date() }) {
  const parentRs = await db.execute({ sql: "SELECT * FROM sam_messages WHERE id = ? LIMIT 1", args: [parentId] });
  const parent = parentRs.rows[0];
  if (!parent || Number(parent.collapsed)) return { error: "MESSAGE_NOT_FOUND" };
  if (!parent.thread_id) return { error: "NOT_SIDE_THREAD" };
  const cleanBody = cleanText(body, MAX_ARGUMENT_LENGTH);
  if (!cleanBody) return { error: "EMPTY_MESSAGE" };
  const createdAt = nowIso(now);
  const id = newId("sam");
  await db.execute({
    sql: `INSERT INTO sam_messages
            (id, definition_id, parent_id, thread_id, body, author_user_id, kind, collapsed, collapsed_into_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'argument', 0, NULL, ?)`,
    args: [id, parent.definition_id, parent.id, parent.thread_id, cleanBody, user.id, createdAt],
  });
  return { id, threadId: parent.thread_id };
}

async function maybeCollapse(db, { threadId, actor, word, definition, realmId, now, notify }) {
  const resolution = await getResolution(db, threadId);
  if (!resolution || resolution.status !== "pending") return { collapsed: false };
  const { activeIds } = await activeParticipants(db, { threadId, realmId, now });
  if (!activeIds.length) return { collapsed: false };
  const agreed = new Set(resolution.agreements.filter((item) => item.agreed).map((item) => item.userId));
  if (!activeIds.every((id) => agreed.has(id))) return { collapsed: false };
  await collapseThread(db, {
    threadId,
    consensusBody: resolution.consensusBody,
    actor,
    word,
    definition,
    realmId,
    now,
    notify,
  });
  return { collapsed: true };
}

export async function proposeResolution(db, { user, threadId, body, realmId, now = new Date(), notify }) {
  const rootRs = await db.execute({ sql: "SELECT * FROM sam_messages WHERE id = ? LIMIT 1", args: [threadId] });
  const root = rootRs.rows[0];
  if (!root || root.thread_id !== root.id) return { error: "NOT_SIDE_THREAD" };
  if (Number(root.collapsed)) return { error: "THREAD_COLLAPSED" };
  const cleanBody = cleanText(body, MAX_ARGUMENT_LENGTH);
  if (!cleanBody) return { error: "EMPTY_MESSAGE" };

  const { activeIds } = await activeParticipants(db, { threadId, realmId, now });
  if (!activeIds.includes(user.id)) return { error: "NOT_PARTICIPANT" };

  const createdAt = nowIso(now);
  await db.batch(
    [
      {
        sql: `INSERT INTO thread_resolutions
                (thread_id, proposed_by_user_id, consensus_body, status, created_at, resolved_at)
              VALUES (?, ?, ?, 'pending', ?, NULL)
              ON CONFLICT(thread_id) DO UPDATE SET
                proposed_by_user_id = excluded.proposed_by_user_id,
                consensus_body = excluded.consensus_body,
                status = 'pending',
                created_at = excluded.created_at,
                resolved_at = NULL`,
        args: [threadId, user.id, cleanBody, createdAt],
      },
      {
        sql: "DELETE FROM thread_resolution_agreements WHERE thread_id = ?",
        args: [threadId],
      },
      {
        sql: `INSERT INTO thread_resolution_agreements (thread_id, user_id, agreed, updated_at)
              VALUES (?, ?, 1, ?)`,
        args: [threadId, user.id, createdAt],
      },
    ],
    "write"
  );

  const ctx = await getDefinitionContext(db, root.definition_id);
  await maybeCollapse(db, {
    threadId,
    actor: user,
    word: ctx.word,
    definition: ctx.definition,
    realmId,
    now,
    notify,
  });
  return { ok: true };
}

export async function agreeResolution(db, { user, threadId, realmId, now = new Date(), notify }) {
  const rootRs = await db.execute({ sql: "SELECT * FROM sam_messages WHERE id = ? LIMIT 1", args: [threadId] });
  const root = rootRs.rows[0];
  if (!root || root.thread_id !== root.id) return { error: "NOT_SIDE_THREAD" };
  if (Number(root.collapsed)) return { error: "THREAD_COLLAPSED" };
  const resolution = await getResolution(db, threadId);
  if (!resolution || resolution.status !== "pending") return { error: "NO_PROPOSAL" };

  const { activeIds } = await activeParticipants(db, { threadId, realmId, now });
  if (!activeIds.includes(user.id)) return { error: "NOT_PARTICIPANT" };

  const createdAt = nowIso(now);
  await db.execute({
    sql: `INSERT INTO thread_resolution_agreements (thread_id, user_id, agreed, updated_at)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(thread_id, user_id) DO UPDATE SET
            agreed = 1,
            updated_at = excluded.updated_at`,
    args: [threadId, user.id, createdAt],
  });

  const ctx = await getDefinitionContext(db, root.definition_id);
  await maybeCollapse(db, {
    threadId,
    actor: user,
    word: ctx.word,
    definition: ctx.definition,
    realmId,
    now,
    notify,
  });
  return { ok: true };
}

export async function listHistory(db, { wordId }) {
  const wordRs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [wordId] });
  if (!wordRs.rows[0]) return { error: "WORD_NOT_FOUND" };
  const rs = await db.execute({
    sql: "SELECT * FROM definition_history WHERE word_id = ? ORDER BY created_at DESC",
    args: [wordId],
  });
  const events = rs.rows.map(publicHistory);
  const actors = await usersById(events.map((item) => item.actorUserId));
  for (const event of events) {
    const actor = actors.get(event.actorUserId);
    event.actorEmail = actor?.email || null;
    event.actorName = actor ? String(actor.email || "").split("@")[0] : null;
  }
  return { word: publicWord(wordRs.rows[0]), events };
}

export async function getHistoryEvent(db, { eventId }) {
  const rs = await db.execute({ sql: "SELECT * FROM definition_history WHERE id = ? LIMIT 1", args: [eventId] });
  const row = rs.rows[0];
  if (!row) return { error: "HISTORY_NOT_FOUND" };
  const event = publicHistory(row);
  const wordRs = await db.execute({ sql: "SELECT * FROM words WHERE id = ? LIMIT 1", args: [event.wordId] });
  return {
    word: wordRs.rows[0] ? publicWord(wordRs.rows[0]) : null,
    event,
    readable: {
      name: event.metadata?.name || wordRs.rows[0]?.name || "",
      clarifier: event.metadata?.clarifier || wordRs.rows[0]?.clarifier || "",
      body: event.metadata?.snapshot || event.metadata?.body || "",
    },
  };
}

export function mapContentError(error) {
  switch (error) {
    case "NOT_MEMBER":
    case "NOT_FOUND":
      return { status: 404, message: "Realm not found.", code: "REALM_NOT_FOUND" };
    case "WORD_NOT_FOUND":
      return { status: 404, message: "Word not found.", code: error };
    case "DEFINITION_NOT_FOUND":
      return { status: 404, message: "Definition not found.", code: error };
    case "MESSAGE_NOT_FOUND":
      return { status: 404, message: "Message not found.", code: error };
    case "THREAD_NOT_FOUND":
      return { status: 404, message: "Thread not found.", code: error };
    case "HISTORY_NOT_FOUND":
      return { status: 404, message: "History entry not found.", code: error };
    case "NAME_REQUIRED":
      return { status: 400, message: "Enter a word or phrase.", code: error };
    case "DEFINITION_REQUIRED":
      return { status: 400, message: "Enter a definition.", code: error };
    case "WORD_EXISTS":
      return { status: 400, message: "That word already exists with this clarifier.", code: error };
    case "EMPTY_MESSAGE":
      return { status: 400, message: "Message cannot be empty.", code: error };
    case "NOT_SIDE_THREAD":
      return { status: 400, message: "Only side threads can be resolved.", code: error };
    case "THREAD_COLLAPSED":
      return { status: 400, message: "That thread has already been resolved.", code: error };
    case "NO_PROPOSAL":
      return { status: 400, message: "No consensus message has been proposed yet.", code: error };
    case "NOT_PARTICIPANT":
      return { status: 403, message: "Only active participants can resolve this thread.", code: error };
    default:
      return { status: 400, message: "Request failed.", code: error || "REQUEST_FAILED" };
  }
}
