// Reads/writes the authenticated user's SECONDARY database, reached via the
// connection stored on their row in the primary database. This is the clearest
// demonstration of the two-tier architecture end to end.

import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  checkRateLimit,
} from "../lib/http.mjs";
import { requireUser } from "../lib/session.mjs";
import {
  getPageRanks,
  getProfile,
  incrementPageRank,
  resetPageRanks,
  updateProfile,
} from "../lib/userdb.mjs";
import { publicUser, recordActivityLog } from "../lib/primary.mjs";

const PAGE_RANK_PATHS = new Set(["/", "/profile", "/settings", "/log", "/realms", "/contacts"]);

function pageRankAction(req) {
  const url = new URL(req.url || "/api/profile", "http://localhost");
  return url.searchParams.get("pageRank");
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  const action = pageRankAction(req);

  if (req.method === "GET") {
    if (action === "list") {
      const ranks = await getPageRanks(user);
      return sendJson(res, 200, { ranks });
    }
    const profile = await getProfile(user);
    return sendJson(res, 200, { user: publicUser(user), profile });
  }

  if (req.method === "POST" && action) {
    checkRateLimit(req, "page-rank", { limit: 240, windowMs: 15 * 60 * 1000 });

    if (action === "record") {
      const body = await readJsonBody(req);
      const path = String(body.path || "");
      if (!PAGE_RANK_PATHS.has(path)) {
        return sendJson(res, 400, { error: "Unknown page rank path.", code: "INVALID_PAGE_RANK_PATH" });
      }
      const ranks = await incrementPageRank(user, path);
      return sendJson(res, 200, { ranks });
    }

    if (action === "reset") {
      const ranks = await resetPageRanks(user);
      return sendJson(res, 200, { ranks });
    }
  }

  if (req.method === "PUT") {
    checkRateLimit(req, "profile", { limit: 60, windowMs: 15 * 60 * 1000 });
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

  return methodNotAllowed(res, ["GET", "POST", "PUT"]);
});
