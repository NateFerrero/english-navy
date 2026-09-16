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
import { hashPassword, verifyPassword, signToken } from "../lib/auth.mjs";
import { ensurePrimarySchema, findUserByEmail, publicUser, recordActivityLog } from "../lib/primary.mjs";

const DUMMY_PASSWORD_HASH = hashPassword("not-a-real-user-password");
const MAX_PASSWORD_LENGTH = 1024;

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  checkRateLimit(req, "login", { limit: 20, windowMs: 15 * 60 * 1000 });

  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw httpError(400, "Password is too long.", "PASSWORD_TOO_LONG");
  }

  await ensurePrimarySchema();

  const user = await findUserByEmail(email);
  const validPassword = verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) {
    throw httpError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
  }

  setSessionCookie(req, res, signToken(user));
  await recordActivityLog({ ownerUserId: user.id, eventType: "sign_in" });
  sendJson(res, 200, { user: publicUser(user) });
});
