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
import { ensurePrimarySchema, findUserById, publicRealm, recordActivityLog } from "../lib/primary.mjs";
import { addUserNotification, markUserNotificationsRead } from "../lib/userdb.mjs";
import {
  addArgument,
  agreeResolution,
  createDefinition,
  createWord,
  forkDefinition,
  getDefinition,
  getHistoryEvent,
  getWord,
  listHistory,
  listWords,
  mapContentError,
  openRealmForMember,
  pickDefinition,
  proposeResolution,
  replyInThread,
  startBranch,
} from "../lib/realmdb.mjs";

function paramsFromRequest(req) {
  const url = new URL(req.url || "/api/realm-content", "http://localhost");
  return {
    action: url.searchParams.get("action") || "",
    realmId: String(url.searchParams.get("realmId") || "").trim(),
    wordId: String(url.searchParams.get("wordId") || "").trim(),
    definitionId: String(url.searchParams.get("definitionId") || "").trim(),
    eventId: String(url.searchParams.get("eventId") || "").trim(),
  };
}

function throwMapped(error) {
  const mapped = mapContentError(error);
  throw httpError(mapped.status, mapped.message, mapped.code);
}

async function notifyFactory(realmId) {
  return async function notify({ userId, eventType, body, metadata }) {
    const target = await findUserById(userId);
    if (!target) return;
    await addUserNotification(target, { realmId, eventType, body, metadata });
  };
}

async function openRealm(user, realmId) {
  if (!realmId) throw httpError(400, "Missing Realm id.", "REALM_ID_REQUIRED");
  const opened = await openRealmForMember(user, realmId);
  if (opened.error) throwMapped(opened.error);
  return opened;
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  await ensurePrimarySchema();
  const params = paramsFromRequest(req);

  if (req.method === "POST" && params.action === "read-notifications") {
    const body = await readJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    await markUserNotificationsRead(user, ids);
    return sendJson(res, 200, { ok: true });
  }

  const opened = await openRealm(user, params.realmId);
  const realm = publicRealm({ ...opened.realm, role: opened.membership.role, member_count: 1 });
  const notify = await notifyFactory(params.realmId);

  if (req.method === "GET") {
    if (params.action === "history" && params.eventId) {
      const result = await getHistoryEvent(opened.db, { eventId: params.eventId });
      if (result.error) throwMapped(result.error);
      return sendJson(res, 200, { realm, ...result });
    }
    if (params.action === "history" && params.wordId) {
      const result = await listHistory(opened.db, { wordId: params.wordId });
      if (result.error) throwMapped(result.error);
      return sendJson(res, 200, { realm, ...result });
    }
    if (params.definitionId) {
      const result = await getDefinition(opened.db, {
        definitionId: params.definitionId,
        userId: user.id,
        realmId: params.realmId,
      });
      if (result.error) throwMapped(result.error);
      return sendJson(res, 200, { realm, ...result });
    }
    if (params.wordId) {
      const result = await getWord(opened.db, { wordId: params.wordId, userId: user.id });
      if (result.error) throwMapped(result.error);
      return sendJson(res, 200, { realm, ...result });
    }
    const result = await listWords(opened.db, { userId: user.id });
    return sendJson(res, 200, { realm, ...result });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  checkRateLimit(req, "realm-content", { limit: 240, windowMs: 15 * 60 * 1000 });
  const body = await readJsonBody(req);
  const action = params.action || String(body.action || "").trim();

  let result;
  if (action === "createWord") {
    result = await createWord(opened.db, {
      user,
      name: body.name,
      clarifier: body.clarifier,
      definition: body.definition,
      notify,
    });
    if (!result.error) {
      await recordActivityLog({
        ownerUserId: user.id,
        eventType: "word_created",
        metadata: { realmId: params.realmId, wordId: result.word.id, name: result.word.name },
      });
    }
  } else if (action === "createDefinition") {
    result = await createDefinition(opened.db, {
      user,
      wordId: body.wordId || params.wordId,
      body: body.body,
      notify,
    });
  } else if (action === "forkDefinition") {
    result = await forkDefinition(opened.db, {
      user,
      definitionId: body.definitionId || params.definitionId,
      body: body.body,
      notify,
    });
    if (!result.error) {
      await recordActivityLog({
        ownerUserId: user.id,
        eventType: "definition_forked",
        metadata: { realmId: params.realmId, wordId: result.word.id },
      });
    }
  } else if (action === "pickDefinition") {
    result = await pickDefinition(opened.db, {
      user,
      wordId: body.wordId || params.wordId,
      definitionId: body.definitionId || params.definitionId,
      notify,
    });
  } else if (action === "addArgument") {
    result = await addArgument(opened.db, {
      user,
      definitionId: body.definitionId || params.definitionId,
      body: body.body,
    });
  } else if (action === "startBranch") {
    result = await startBranch(opened.db, {
      user,
      parentId: body.parentId,
      body: body.body,
    });
  } else if (action === "reply") {
    result = await replyInThread(opened.db, {
      user,
      parentId: body.parentId,
      body: body.body,
    });
  } else if (action === "proposeResolution") {
    result = await proposeResolution(opened.db, {
      user,
      threadId: body.threadId,
      body: body.body,
      realmId: params.realmId,
      notify,
    });
  } else if (action === "agreeResolution") {
    result = await agreeResolution(opened.db, {
      user,
      threadId: body.threadId,
      realmId: params.realmId,
      notify,
    });
  } else {
    throw httpError(400, "Unknown action.", "UNKNOWN_ACTION");
  }

  if (result?.error) throwMapped(result.error);

  const samActions = new Set(["addArgument", "startBranch", "reply", "proposeResolution", "agreeResolution"]);
  if (samActions.has(action)) {
    const definitionId = result.definitionId || body.definitionId || params.definitionId;
    if (definitionId) {
      result = await getDefinition(opened.db, {
        definitionId,
        userId: user.id,
        realmId: params.realmId,
      });
      if (result.error) throwMapped(result.error);
    }
  }

  return sendJson(res, 201, { realm, ...result });
});
