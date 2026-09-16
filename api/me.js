import { handlePreflight, sendJson, withErrors, methodNotAllowed } from "../lib/http.mjs";
import { publicUser } from "../lib/primary.mjs";
import { requireUser } from "../lib/session.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const user = await requireUser(req);
  sendJson(res, 200, { user: publicUser(user) });
});
