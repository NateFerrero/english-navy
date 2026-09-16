import crypto from "node:crypto";
import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
} from "../lib/http.mjs";
import { hashPassword, signToken } from "../lib/auth.mjs";
import {
  ensurePrimarySchema,
  findUserByEmail,
  insertUser,
  publicUser,
} from "../lib/primary.mjs";
import { provisionUserDatabase } from "../lib/provisioner.mjs";
import { seedUserDatabase } from "../lib/userdb.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueEmailConstraint(err) {
  return err?.code === "SQLITE_CONSTRAINT" && /users\.email/i.test(err.message);
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!EMAIL_RE.test(email)) {
    throw httpError(400, "Enter a valid email address.", "INVALID_EMAIL");
  }
  if (password.length < 8) {
    throw httpError(400, "Password must be at least 8 characters.", "WEAK_PASSWORD");
  }

  await ensurePrimarySchema();

  if (await findUserByEmail(email)) {
    throw httpError(409, "An account with that email already exists.", "EMAIL_TAKEN");
  }

  const id = `usr_${crypto.randomBytes(9).toString("hex")}`;
  const createdAt = new Date().toISOString();

  // 1) Provision this user's OWN secondary database and get its connection.
  const connection = await provisionUserDatabase(id);

  const user = {
    id,
    email,
    password_hash: hashPassword(password),
    created_at: createdAt,
    db_name: connection.db_name,
    db_url: connection.db_url,
    db_auth_token: connection.db_auth_token,
  };

  // 2) Store the account + the connection to its secondary DB in the primary DB.
  try {
    await insertUser(user);
  } catch (err) {
    if (!isUniqueEmailConstraint(err)) throw err;
    throw httpError(409, "An account with that email already exists.", "EMAIL_TAKEN");
  }

  // 3) Initialize the secondary database schema for this user.
  await seedUserDatabase(user);

  const token = signToken(id);
  sendJson(res, 201, { user: publicUser(user), token });
});
