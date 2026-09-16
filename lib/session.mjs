// Resolve the authenticated user for a request from its Bearer token.

import { getBearerToken, httpError } from "./http.mjs";
import { verifyToken } from "./auth.mjs";
import { ensurePrimarySchema, findUserById } from "./primary.mjs";

export async function requireUser(req) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload) throw httpError(401, "Missing or invalid session token", "UNAUTHORIZED");

  await ensurePrimarySchema();
  const user = await findUserById(payload.uid);
  if (!user) throw httpError(401, "Session user no longer exists", "UNAUTHORIZED");
  return user;
}
