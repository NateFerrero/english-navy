import {
  handlePreflight,
  sendJson,
  readJsonBody,
  withErrors,
  methodNotAllowed,
  httpError,
  checkRateLimit,
} from "../lib/http.mjs";
import { requireUser } from "../lib/session.mjs";
import {
  ensurePrimarySchema,
  createOrGetDirectMessageThread,
  getMessageThreadForUser,
  listMessageInboxForUser,
  respondToMessageInvitation,
  sendMessageInThread,
  recordActivityLog,
} from "../lib/primary.mjs";

function actionFromRequest(req) {
  const url = new URL(req.url || "/api/messages", "http://localhost");
  return url.searchParams.get("action") || "";
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  await ensurePrimarySchema();
  const action = actionFromRequest(req);

  if (req.method === "GET" && !action) {
    const inbox = await listMessageInboxForUser(user);
    return sendJson(res, 200, inbox);
  }

  if (req.method === "GET" && action === "thread") {
    const url = new URL(req.url || "/api/messages", "http://localhost");
    const threadId = String(url.searchParams.get("id") || "").trim();
    if (!threadId) throw httpError(400, "Missing thread id.", "THREAD_ID_REQUIRED");
    const thread = await getMessageThreadForUser({ user, threadId });
    if (!thread) throw httpError(404, "Thread not found.", "THREAD_NOT_FOUND");
    return sendJson(res, 200, thread);
  }

  if (req.method === "POST" && action === "thread") {
    checkRateLimit(req, "messages-thread", { limit: 120, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const otherUserId = String(body.otherUserId || "").trim();
    if (!otherUserId) throw httpError(400, "Choose a contact to message.", "OTHER_USER_REQUIRED");

    const result = await createOrGetDirectMessageThread({ user, otherUserId });
    if (result.error === "NO_USER") throw httpError(404, "User not found.", "USER_NOT_FOUND");
    if (result.error === "SELF") throw httpError(400, "You cannot message yourself.", "SELF");
    if (result.error === "CONTACT_REQUIRED") {
      throw httpError(403, "That user must add you as a contact (or you must add them) before messaging.", "CONTACT_REQUIRED");
    }

    if (result.invitation?.status === "pending") {
      await recordActivityLog({
        ownerUserId: otherUserId,
        actorUserId: user.id,
        eventType: "message_invitation_received",
        metadata: { threadId: result.thread.id },
      });
    }

    return sendJson(res, 201, { threadId: result.thread.id });
  }

  if (req.method === "POST" && action === "send") {
    checkRateLimit(req, "messages-send", { limit: 240, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const threadId = String(body.threadId || "").trim();
    const text = String(body.body || "");
    if (!threadId) throw httpError(400, "Missing thread id.", "THREAD_ID_REQUIRED");

    const result = await sendMessageInThread({ user, threadId, body: text });
    if (result.error === "EMPTY") throw httpError(400, "Message cannot be empty.", "EMPTY_MESSAGE");
    if (result.error === "TOO_LONG") throw httpError(400, "Message is too long.", "MESSAGE_TOO_LONG");
    if (result.error === "NOT_FOUND") throw httpError(404, "Thread not found.", "THREAD_NOT_FOUND");
    if (result.error === "INVITATION_PENDING") {
      throw httpError(403, "You can preview this invitation but cannot reply until you add them as a contact.", "INVITATION_PENDING");
    }
    if (result.error === "INVITATION_DECLINED") throw httpError(403, "This invitation was declined.", "INVITATION_DECLINED");

    await recordActivityLog({
      ownerUserId: user.id,
      actorUserId: user.id,
      eventType: "message_sent",
      metadata: { threadId },
    });

    return sendJson(res, 201, result);
  }

  if (req.method === "POST" && action === "respond") {
    checkRateLimit(req, "messages-respond", { limit: 120, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const invitationId = String(body.invitationId || "").trim();
    const responseAction = String(body.response || "").trim().toLowerCase();
    if (!invitationId) throw httpError(400, "Missing invitation id.", "INVITATION_ID_REQUIRED");
    if (!["accept", "decline"].includes(responseAction)) {
      throw httpError(400, "Choose Accept or Decline.", "INVALID_RESPONSE");
    }
    const invitation = await respondToMessageInvitation({ user, invitationId, action: responseAction });
    if (!invitation) throw httpError(404, "Invitation not found.", "INVITATION_NOT_FOUND");

    await recordActivityLog({
      ownerUserId: user.id,
      actorUserId: user.id,
      eventType: `message_invitation_${responseAction}ed`,
      metadata: { threadId: invitation.threadId },
    });

    return sendJson(res, 200, { invitation });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});

