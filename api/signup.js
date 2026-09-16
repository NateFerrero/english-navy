import crypto from "node:crypto";
import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
  setSessionCookie,
  checkRateLimit,
} from "../lib/http.mjs";
import { hashPassword, signToken } from "../lib/auth.mjs";
import {
  ensurePrimarySchema,
  findUserByEmail,
  insertUser,
  publicUser,
  normalizeInviteCode,
  recordActivityLog,
  releaseInviteCodeReservation,
  reserveInviteCodeForUser,
} from "../lib/primary.mjs";
import { provisionUserDatabase } from "../lib/provisioner.mjs";
import { seedUserDatabase } from "../lib/userdb.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 1024;

function isUniqueEmailConstraint(err) {
  return err?.code === "SQLITE_CONSTRAINT" && /users\.email/i.test(err.message);
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  checkRateLimit(req, "signup", { limit: 10, windowMs: 15 * 60 * 1000 });

  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const inviteCode = normalizeInviteCode(body.inviteCode);

  if (!EMAIL_RE.test(email)) {
    throw httpError(400, "Enter a valid email address.", "INVALID_EMAIL");
  }
  if (password.length < 8) {
    throw httpError(400, "Password must be at least 8 characters.", "WEAK_PASSWORD");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw httpError(400, "Password is too long.", "PASSWORD_TOO_LONG");
  }
  if (!inviteCode) {
    throw httpError(400, "Enter an invite code.", "INVITE_CODE_REQUIRED");
  }

  await ensurePrimarySchema();

  const id = `usr_${crypto.randomBytes(9).toString("hex")}`;
  const createdAt = new Date().toISOString();
  const invite = await reserveInviteCodeForUser(inviteCode, id);
  if (!invite) {
    throw httpError(400, "Enter a valid unused invite code.", "INVALID_INVITE_CODE");
  }

  let userInserted = false;
  let user;
  try {
    if (await findUserByEmail(email)) {
      throw httpError(400, "Could not create an account with those details.", "SIGNUP_REJECTED");
    }

    // 1) Provision this user's OWN secondary database and get its connection.
    const connection = await provisionUserDatabase(id);

    user = {
      id,
      email,
      password_hash: hashPassword(password),
      created_at: createdAt,
      db_name: connection.db_name,
      db_url: connection.db_url,
      db_auth_token: connection.db_auth_token,
      invited_by_user_id: invite.created_by_user_id,
    };

    // 2) Store the account + the connection to its secondary DB in the primary DB.
    try {
      await insertUser(user);
      userInserted = true;
    } catch (err) {
      if (!isUniqueEmailConstraint(err)) throw err;
      throw httpError(400, "Could not create an account with those details.", "SIGNUP_REJECTED");
    }

    // 3) Initialize the secondary database schema for this user.
    await seedUserDatabase(user);
    await recordActivityLog({
      ownerUserId: invite.created_by_user_id,
      actorUserId: id,
      eventType: "invitation_accepted",
      inviteCode,
      metadata: { invitedEmail: email },
    });
  } catch (err) {
    if (!userInserted) await releaseInviteCodeReservation(inviteCode, id);
    throw err;
  }

  setSessionCookie(req, res, signToken(user));
  sendJson(res, 201, { user: publicUser(user) });
});
