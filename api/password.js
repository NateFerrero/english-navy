import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
  checkRateLimit,
} from "../lib/http.mjs";
import { hashPassword, verifyPassword } from "../lib/auth.mjs";
import { requireUser } from "../lib/session.mjs";
import { recordActivityLog, updateUserPassword } from "../lib/primary.mjs";

const MAX_PASSWORD_LENGTH = 1024;

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "PUT") return methodNotAllowed(res, ["PUT"]);
  checkRateLimit(req, "password", { limit: 10, windowMs: 15 * 60 * 1000 });

  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (newPassword.length > MAX_PASSWORD_LENGTH || currentPassword.length > MAX_PASSWORD_LENGTH) {
    throw httpError(400, "Password is too long.", "PASSWORD_TOO_LONG");
  }
  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw httpError(401, "Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
  }
  if (newPassword.length < 8) {
    throw httpError(400, "New password must be at least 8 characters.", "WEAK_PASSWORD");
  }

  await updateUserPassword(user.id, hashPassword(newPassword));
  await recordActivityLog({ ownerUserId: user.id, eventType: "password_change" });
  sendJson(res, 200, { ok: true });
});
