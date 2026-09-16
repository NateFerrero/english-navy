import {
  clearSessionCookie,
  handlePreflight,
  sendJson,
  withErrors,
  methodNotAllowed,
} from "../lib/http.mjs";
import { publicUser } from "../lib/primary.mjs";
import { requireUser } from "../lib/session.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method === "DELETE") {
    clearSessionCookie(req, res);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "DELETE"]);

  const user = await requireUser(req);
  sendJson(res, 200, { user: publicUser(user) });
});
