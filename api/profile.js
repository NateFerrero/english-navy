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
import { publicUser, recordActivityLog } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);

  if (req.method === "GET") {
    const profile = await getProfile(user);
    return sendJson(res, 200, { user: publicUser(user), profile });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const fields = ["display_name", "first_name", "last_name", "bio", "default_timezone"].filter(
      (key) => body[key] !== undefined
    );
    const profile = await updateProfile(user, {
      display_name: body.display_name,
      first_name: body.first_name,
      last_name: body.last_name,
      bio: body.bio,
      default_timezone: body.default_timezone,
    });
    await recordActivityLog({
      ownerUserId: user.id,
      eventType: "profile_change",
      metadata: { fields },
    });
    return sendJson(res, 200, { user: publicUser(user), profile });
  }

  return methodNotAllowed(res, ["GET", "PUT"]);
});
