import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
} from "../lib/http.mjs";
import { requireUser } from "../lib/session.mjs";
import {
  countInviteCodesCreatedByUser,
  createInviteCodesForUser,
  ensurePrimarySchema,
  listInviteCodesByCreator,
  recordActivityLog,
} from "../lib/primary.mjs";

const MAX_INVITE_CODES_PER_USER = 100;

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  await ensurePrimarySchema();

  if (req.method === "GET") {
    const inviteCodes = await listInviteCodesByCreator(user.id);
    const createdCount = inviteCodes.length;
    return sendJson(res, 200, {
      inviteCodes,
      remaining: Math.max(0, MAX_INVITE_CODES_PER_USER - createdCount),
    });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const count = Number(body.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > MAX_INVITE_CODES_PER_USER) {
      throw httpError(400, "Request between 1 and 100 invite codes.", "INVALID_INVITE_COUNT");
    }

    const createdCount = await countInviteCodesCreatedByUser(user.id);
    const remaining = MAX_INVITE_CODES_PER_USER - createdCount;
    if (count > remaining) {
      throw httpError(
        400,
        `You can create ${remaining} more invite code${remaining === 1 ? "" : "s"}.`,
        "INVITE_LIMIT_REACHED"
      );
    }

    let inviteCodes;
    try {
      inviteCodes = await createInviteCodesForUser(user.id, count);
    } catch (err) {
      if (String(err.message || "").includes("INVITE_CODE_LIMIT_REACHED")) {
        throw httpError(400, "You have reached the 100 invite code limit.", "INVITE_LIMIT_REACHED");
      }
      throw err;
    }

    await recordActivityLog({
      ownerUserId: user.id,
      eventType: "invite_created",
      metadata: { count: inviteCodes.length },
    });
    return sendJson(res, 201, {
      inviteCodes,
      remaining: remaining - inviteCodes.length,
    });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
