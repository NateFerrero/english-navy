import {
  handlePreflight,
  sendJson,
  withErrors,
  methodNotAllowed,
} from "../lib/http.mjs";
import { requireUser } from "../lib/session.mjs";
import { ensurePrimarySchema, listActivityLogForUser } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const user = await requireUser(req);
  await ensurePrimarySchema();
  const entries = await listActivityLogForUser(user.id);
  sendJson(res, 200, { entries });
});
