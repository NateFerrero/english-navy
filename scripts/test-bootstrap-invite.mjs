import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "english-navy-bootstrap-invite-"));
process.env.DB_PROVIDER = "local";
process.env.LOCAL_DATA_DIR = dataDir;
delete process.env.TURSO_PRIMARY_DB_URL;
delete process.env.TURSO_PRIMARY_DB_AUTH_TOKEN;

const {
  BOOTSTRAP_INVITE_CODE,
  createInviteCodesForUser,
  ensurePrimarySchema,
  insertUser,
  isBootstrapInviteCode,
  normalizeInviteCode,
  reserveInviteCodeForUser,
} = await import("../lib/primary.mjs");

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

try {
  assert.equal(normalizeInviteCode(" 0000-0000-0000 "), BOOTSTRAP_INVITE_CODE);
  assert.equal(isBootstrapInviteCode("0000-0000-0000"), true);
  assert.equal(isBootstrapInviteCode(" 0000-0000-0000 "), true);
  assert.equal(isBootstrapInviteCode("AAAA-BBBB-CCCC"), false);

  await ensurePrimarySchema();

  const firstId = "usr_bootstrap";
  const bootstrapInvite = await reserveInviteCodeForUser(BOOTSTRAP_INVITE_CODE, firstId);
  assert.ok(bootstrapInvite, "bootstrap invite should be accepted when no users exist");
  assert.equal(bootstrapInvite.code, BOOTSTRAP_INVITE_CODE);
  assert.equal(bootstrapInvite.created_by_user_id, null);
  assert.equal(bootstrapInvite.claimed_by_user_id, firstId);

  const otherEmpty = await reserveInviteCodeForUser("AAAA-BBBB-CCCC", "usr_other");
  assert.equal(otherEmpty, null, "non-bootstrap codes should still fail when none exist");

  await insertUser(dummyUser(firstId, "admiral@example.com"));

  const secondBootstrap = await reserveInviteCodeForUser(BOOTSTRAP_INVITE_CODE, "usr_second");
  assert.equal(secondBootstrap, null, "bootstrap invite should be rejected after a user exists");

  const [realInvite] = await createInviteCodesForUser(firstId, 1);
  const claimed = await reserveInviteCodeForUser(realInvite.code, "usr_invited");
  assert.ok(claimed, "normal invite codes should still work after the first user exists");
  assert.equal(claimed.created_by_user_id, firstId);

  console.log("bootstrap invite tests passed");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
