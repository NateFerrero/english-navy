import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "english-navy-definitions-"));
process.env.DB_PROVIDER = "local";
process.env.LOCAL_DATA_DIR = dataDir;
delete process.env.TURSO_PRIMARY_DB_URL;
delete process.env.TURSO_PRIMARY_DB_AUTH_TOKEN;

const { addRealmMember, ensurePrimarySchema, insertRealm, insertUser, setUserLastSeenAt } = await import("../lib/primary.mjs");
const { addUserNotification, grantRealmAccess, listUserNotifications, seedRealmDatabase, seedUserDatabase } = await import("../lib/userdb.mjs");
const {
  THREAD_INACTIVITY_MS,
  addArgument,
  agreeResolution,
  createWord,
  ensureRealmContentSchema,
  forkDefinition,
  getDefinition,
  getWord,
  listHistory,
  listWords,
  pickDefinition,
  proposeResolution,
  replyInThread,
  startBranch,
} = await import("../lib/realmdb.mjs");

function dummyUser(id, email) {
  return {
    id,
    email,
    password_hash: "hash",
    created_at: new Date().toISOString(),
    db_name: `en-${id}`,
    db_url: `file:${dataDir}/users/en-${id}.db`,
    db_auth_token: null,
    invited_by_user_id: null,
  };
}

function notifyFor(usersById, realmId) {
  return async function notify({ userId, eventType, body, metadata }) {
    const target = usersById.get(userId);
    if (!target) return;
    await addUserNotification(target, { realmId, eventType, body, metadata });
  };
}

try {
  await ensurePrimarySchema();
  const alice = dummyUser("usr_alice", "alice@example.com");
  const bob = dummyUser("usr_bob", "bob@example.com");
  const cara = dummyUser("usr_cara", "cara@example.com");
  await insertUser(alice);
  await insertUser(bob);
  await insertUser(cara);
  await seedUserDatabase(alice);
  await seedUserDatabase(bob);
  await seedUserDatabase(cara);

  const realmId = "rlm_test";
  const createdAt = new Date().toISOString();
  const connection = {
    db_name: `en-${realmId}`,
    db_url: `file:${dataDir}/realms/en-${realmId}.db`,
    db_auth_token: null,
  };
  const realmRow = {
    id: realmId,
    owner_user_id: alice.id,
    title: "Animal Rights",
    description: "Test realm",
    db_name: connection.db_name,
    db_url: connection.db_url,
    created_at: createdAt,
  };
  await insertRealm(realmRow);
  await seedRealmDatabase(connection, realmRow);
  const db = await ensureRealmContentSchema(connection);
  await grantRealmAccess(alice, { realmId, dbUrl: connection.db_url, dbAuthToken: null });
  await addRealmMember({ realmId, userId: bob.id, role: "member" });
  await addRealmMember({ realmId, userId: cara.id, role: "member" });
  await grantRealmAccess(bob, { realmId, dbUrl: connection.db_url, dbAuthToken: null });
  await grantRealmAccess(cara, { realmId, dbUrl: connection.db_url, dbAuthToken: null });

  const usersById = new Map([
    [alice.id, alice],
    [bob.id, bob],
    [cara.id, cara],
  ]);
  const notify = notifyFor(usersById, realmId);

  const created = await createWord(db, {
    user: alice,
    name: "Mouse",
    clarifier: "Animal",
    definition: "A small rodent.",
    notify,
  });
  assert.equal(created.word.name, "Mouse");
  assert.equal(created.word.clarifier, "Animal");
  assert.equal(created.currentDefinitions.length, 1);
  assert.equal(created.currentDefinitions[0].body, "A small rodent.");
  assert.equal(created.myPickId, created.definitions[0].id);

  const duplicate = await createWord(db, {
    user: alice,
    name: "Mouse",
    clarifier: "Animal",
    definition: "Duplicate",
    notify,
  });
  assert.equal(duplicate.error, "WORD_EXISTS");

  const device = await createWord(db, {
    user: alice,
    name: "Mouse",
    clarifier: "Computer Device",
    definition: "A handheld pointing device.",
    notify,
  });
  assert.equal(device.word.clarifier, "Computer Device");
  const listed = await listWords(db, { userId: alice.id });
  assert.equal(listed.words.length, 2);
  assert.ok(listed.words.every((word) => word.name === "Mouse"));

  const originalId = created.definitions[0].id;
  const forked = await forkDefinition(db, {
    user: bob,
    definitionId: originalId,
    body: "A small rodent, typically kept as a pet.",
    notify,
  });
  assert.equal(forked.definitions.length, 2);
  const fork = forked.definitions.find((item) => item.forkedFromId === originalId);
  assert.ok(fork);
  const aliceNotices = await listUserNotifications(alice);
  assert.ok(aliceNotices.some((item) => item.eventType === "definition_forked"));

  const bobPick = await pickDefinition(db, {
    user: bob,
    wordId: created.word.id,
    definitionId: fork.id,
    notify,
  });
  assert.equal(bobPick.currentDefinitions.length, 2, "equal picks should tie as current");
  const aliceTieNotices = await listUserNotifications(alice);
  assert.ok(aliceTieNotices.some((item) => item.eventType === "definition_tied"));

  const aliceSwitch = await pickDefinition(db, {
    user: alice,
    wordId: created.word.id,
    definitionId: fork.id,
    notify,
  });
  assert.equal(aliceSwitch.currentDefinitions.length, 1);
  assert.equal(aliceSwitch.currentDefinitions[0].id, fork.id);
  assert.equal(aliceSwitch.myPickId, fork.id);

  const history = await listHistory(db, { wordId: created.word.id });
  assert.ok(history.events.some((item) => item.eventType === "consensus_changed"));
  assert.ok(history.events.some((item) => item.eventType === "pick_changed"));
  assert.ok(history.events.every((item) => !item.metadata?.deadline && !item.metadata?.timer));

  const argument = await addArgument(db, { user: alice, definitionId: fork.id, body: "Pet mice are still mice." });
  const branch = await startBranch(db, { user: bob, parentId: argument.id, body: "Only some of them." });
  await replyInThread(db, { user: cara, parentId: branch.id, body: "Agree they are still mice." });
  await replyInThread(db, { user: alice, parentId: branch.id, body: "They are still mice." });

  const beforeResolve = await getDefinition(db, { definitionId: fork.id, userId: alice.id, realmId });
  assert.equal(beforeResolve.messages.filter((item) => item.threadId === branch.threadId).length, 3);
  assert.equal(beforeResolve.resolutions[branch.threadId].canResolve, true);

  await proposeResolution(db, {
    user: alice,
    threadId: branch.threadId,
    body: "Pet mice remain mice.",
    realmId,
    notify,
  });
  const waiting = await getDefinition(db, { definitionId: fork.id, userId: bob.id, realmId });
  assert.equal(waiting.resolutions[branch.threadId].status, "pending");
  assert.ok(waiting.messages.some((item) => item.threadId === branch.threadId));

  await agreeResolution(db, { user: bob, threadId: branch.threadId, realmId, notify });
  const stillOpen = await getDefinition(db, { definitionId: fork.id, userId: cara.id, realmId });
  assert.equal(stillOpen.resolutions[branch.threadId].status, "pending");

  await agreeResolution(db, { user: cara, threadId: branch.threadId, realmId, notify });
  const collapsed = await getDefinition(db, { definitionId: fork.id, userId: alice.id, realmId });
  assert.equal(collapsed.messages.some((item) => item.threadId === branch.threadId), false);
  const consensus = collapsed.messages.find((item) => item.kind === "consensus");
  assert.ok(consensus);
  assert.equal(consensus.body, "Pet mice remain mice.");
  assert.equal(consensus.parentId, argument.id);
  const bobCollapseNotices = await listUserNotifications(bob);
  assert.ok(bobCollapseNotices.some((item) => item.eventType === "thread_collapsed"));

  const argument2 = await addArgument(db, { user: alice, definitionId: fork.id, body: "Another point." });
  const staleBranch = await startBranch(db, { user: bob, parentId: argument2.id, body: "Stale debate." });
  await replyInThread(db, { user: cara, parentId: staleBranch.id, body: "I am going inactive." });
  const staleIso = new Date(Date.now() - THREAD_INACTIVITY_MS - 1000).toISOString();
  await setUserLastSeenAt(cara.id, staleIso);

  const stalePropose = await proposeResolution(db, {
    user: bob,
    threadId: staleBranch.threadId,
    body: "Inactive members are not required.",
    realmId,
    notify,
  });
  assert.equal(stalePropose.error, undefined);
  const autoCollapsed = await getDefinition(db, { definitionId: fork.id, userId: alice.id, realmId, now: new Date() });
  assert.ok(autoCollapsed.messages.some((item) => item.kind === "consensus" && item.body === "Inactive members are not required."));
  assert.equal(autoCollapsed.messages.some((item) => item.threadId === staleBranch.threadId), false);

  const wordAfter = await getWord(db, { wordId: created.word.id, userId: alice.id });
  assert.ok(wordAfter.currentDefinitions.length >= 1);

  console.log("realm definition tests passed");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
