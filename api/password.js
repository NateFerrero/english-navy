import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
} from "../lib/http.mjs";
import { hashPassword, verifyPassword } from "../lib/auth.mjs";
import { requireUser } from "../lib/session.mjs";
import { updateUserPassword } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "PUT") return methodNotAllowed(res, ["PUT"]);

  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw httpError(401, "Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
  }
  if (newPassword.length < 8) {
    throw httpError(400, "New password must be at least 8 characters.", "WEAK_PASSWORD");
  }

  await updateUserPassword(user.id, hashPassword(newPassword));
  sendJson(res, 200, { ok: true });
});
