import crypto from "node:crypto";
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
  createRealmInvitation,
  ensurePrimarySchema,
  findRealmById,
  insertRealm,
  listPendingRealmInvitations,
  listRealmInviteOptionsForUser,
  listRealmsForUser,
  publicRealm,
  recordActivityLog,
  respondToRealmInvitation,
} from "../lib/primary.mjs";
import { mintDatabaseToken, provisionRealmDatabase } from "../lib/provisioner.mjs";
import { grantRealmAccess, seedRealmDatabase } from "../lib/userdb.mjs";

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;

function actionFromRequest(req) {
  const url = new URL(req.url || "/api/realms", "http://localhost");
  return url.searchParams.get("action") || "";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  await ensurePrimarySchema();
  const action = actionFromRequest(req);

  if (req.method === "GET") {
    if (action === "notifications") {
      const invitations = await listPendingRealmInvitations(user.id);
      return sendJson(res, 200, { invitations, count: invitations.length });
    }

    const [realms, inviteOptions, invitations] = await Promise.all([
      listRealmsForUser(user.id),
      listRealmInviteOptionsForUser(user),
      listPendingRealmInvitations(user.id),
    ]);
    return sendJson(res, 200, { realms, inviteOptions, invitations });
  }

  if (req.method === "POST" && !action) {
    checkRateLimit(req, "realms-create", { limit: 30, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const title = cleanText(body.title, MAX_TITLE_LENGTH);
    const description = cleanText(body.description, MAX_DESCRIPTION_LENGTH);
    if (!title) throw httpError(400, "Enter a Realm title.", "TITLE_REQUIRED");

    const id = `rlm_${crypto.randomBytes(9).toString("hex")}`;
    const createdAt = new Date().toISOString();
    const connection = await provisionRealmDatabase(id);
    const realmRow = {
      id,
      owner_user_id: user.id,
      title,
      description,
      db_name: connection.db_name,
      db_url: connection.db_url,
      created_at: createdAt,
    };

    await insertRealm(realmRow);
    await seedRealmDatabase(connection, realmRow);
    await grantRealmAccess(user, {
      realmId: id,
      dbUrl: connection.db_url,
      dbAuthToken: connection.db_auth_token,
    });
    await recordActivityLog({
      ownerUserId: user.id,
      eventType: "realm_created",
      metadata: { realmId: id, title },
    });
    return sendJson(res, 201, { realm: publicRealm({ ...realmRow, role: "owner", member_count: 1 }) });
  }

  if (req.method === "POST" && action === "invite") {
    checkRateLimit(req, "realms-invite", { limit: 60, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const realmId = String(body.realmId || "").trim();
    const inviteeEmail = String(body.email || "").trim().toLowerCase();
    const realm = await findRealmById(realmId);
    if (!realm || realm.owner_user_id !== user.id) {
      throw httpError(404, "Realm not found.", "REALM_NOT_FOUND");
    }

    const result = await createRealmInvitation({ realm, inviterUser: user, inviteeEmail });
    if (result.error === "NO_USER") {
      throw httpError(400, "That email does not belong to an account yet.", "INVITEE_NOT_FOUND");
    }
    if (result.error === "SELF") {
      throw httpError(400, "You are already a member of your Realm.", "SELF_INVITE");
    }
    if (result.error === "CONTACT_REQUIRED") {
      throw httpError(
        403,
        "That user must add you as a Contact before you can invite them to a Realm.",
        "CONTACT_REQUIRED"
      );
    }
    if (result.error === "ALREADY_MEMBER") {
      throw httpError(400, "That user is already a member of this Realm.", "ALREADY_MEMBER");
    }

    await recordActivityLog({
      ownerUserId: result.invitee.id,
      actorUserId: user.id,
      eventType: "realm_invitation_received",
      metadata: { realmId, realmTitle: realm.title },
    });
    return sendJson(res, 201, { invitation: result.invitation });
  }

  if (req.method === "POST" && action === "respond") {
    checkRateLimit(req, "realms-respond", { limit: 60, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const invitationId = String(body.invitationId || "").trim();
    const responseAction = String(body.response || "").trim().toLowerCase();
    if (!["accept", "decline"].includes(responseAction)) {
      throw httpError(400, "Choose Accept or Decline.", "INVALID_RESPONSE");
    }

    const invitation = await respondToRealmInvitation({
      invitationId,
      userId: user.id,
      action: responseAction,
    });
    if (!invitation) throw httpError(404, "Invitation not found.", "INVITATION_NOT_FOUND");

    if (responseAction === "accept") {
      const realm = await findRealmById(invitation.realmId);
      if (!realm) throw httpError(404, "Realm not found.", "REALM_NOT_FOUND");
      await grantRealmAccess(user, {
        realmId: realm.id,
        dbUrl: realm.db_url,
        dbAuthToken: await mintDatabaseToken(realm.db_name),
      });
    }

    await recordActivityLog({
      ownerUserId: user.id,
      actorUserId: user.id,
      eventType: `realm_invitation_${responseAction}ed`,
      metadata: { realmId: invitation.realmId, realmTitle: invitation.realmTitle },
    });
    return sendJson(res, 200, { invitation });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
