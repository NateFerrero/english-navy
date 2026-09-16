import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
} from "../lib/http.mjs";
import { verifyPassword, signToken } from "../lib/auth.mjs";
import { ensurePrimarySchema, findUserByEmail, publicUser } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  await ensurePrimarySchema();

  const user = await findUserByEmail(email);
  // Same response for unknown email vs. wrong password (avoid user enumeration).
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw httpError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
  }

  const token = signToken(user.id);
  sendJson(res, 200, { user: publicUser(user), token });
});
