// Reads/writes the authenticated user's SECONDARY database, reached via the
// connection stored on their row in the primary database. This is the clearest
// demonstration of the two-tier architecture end to end.

import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
} from "../lib/http.mjs";
import { requireUser } from "../lib/session.mjs";
import { getProfile, updateProfile } from "../lib/userdb.mjs";
import { publicUser } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);

  if (req.method === "GET") {
    const profile = await getProfile(user);
    return sendJson(res, 200, { user: publicUser(user), profile });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const profile = await updateProfile(user, {
      display_name: body.display_name,
      bio: body.bio,
    });
    return sendJson(res, 200, { user: publicUser(user), profile });
  }

  return methodNotAllowed(res, ["GET", "PUT"]);
});
