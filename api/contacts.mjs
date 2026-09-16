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
  addContactForUser,
  ensurePrimarySchema,
  listContactsForUser,
  normalizeEmail,
  recordActivityLog,
} from "../lib/primary.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const user = await requireUser(req);
  await ensurePrimarySchema();

  if (req.method === "GET") {
    return sendJson(res, 200, { contacts: await listContactsForUser(user.id) });
  }

  if (req.method === "POST") {
    checkRateLimit(req, "contacts", { limit: 60, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    if (!EMAIL_RE.test(email)) {
      throw httpError(400, "Enter a valid email address.", "INVALID_EMAIL");
    }
    if (email === normalizeEmail(user.email)) {
      throw httpError(400, "You are already available to your own Realms.", "SELF_CONTACT");
    }

    const contact = await addContactForUser(user.id, email, "manual");
    await recordActivityLog({
      ownerUserId: user.id,
      eventType: "contact_added",
      metadata: { contactEmail: email },
    });
    return sendJson(res, 201, { contact });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
});
