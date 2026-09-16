import { handlePreflight, sendJson, withErrors, methodNotAllowed } from "../lib/http.mjs";
import { config } from "../lib/config.mjs";
import { ensurePrimarySchema } from "../lib/primary.mjs";

export default withErrors(async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  // Touch the primary DB so health reflects real connectivity.
  await ensurePrimarySchema();

  sendJson(res, 200, {
    ok: true,
    service: "english-navy-api",
    provider: config.provider,
    time: new Date().toISOString(),
  });
});
