// GET /api/cron/renew (Vercel Cron, daily 03:07 UTC)
// Renews monthly credits for active subscriptions; downgrades expired ones.
// In production Vercel sends its own cron secret; locally you can call it with ?cron=...
const { json } = require("../lib/util");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  try {
    if (process.env.CRON_SECRET) {
      const auth = req.headers.authorization || "";
      const urlParam = (req.query && req.query.cron) || "";
      if (auth !== "Bearer " + process.env.CRON_SECRET && urlParam !== process.env.CRON_SECRET) {
        return json(res, 401, { error: "Unauthorized" });
      }
    }
    const n = await adminRest("POST", "/rest/v1/rpc/renew_subscriptions");
    json(res, 200, { renewed: Array.isArray(n) ? n[0] : n });
  } catch (e) { json(res, 500, { error: e.message }); }
};
