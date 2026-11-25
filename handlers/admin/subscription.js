// POST /api/admin/subscription  { user_id, action: 'grant_monthly'|'grant_yearly'|'revoke' }
const { cors, json, readJson } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");
const { addMonths } = require("../payments/activate");
const { PREMIUM_CREDITS } = require("../lib/plans");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    const b = await readJson(req, 1);
    if (!b.user_id || !b.action) return json(res, 400, { error: "user_id and action required" });
    const now = new Date().toISOString();
    let patch;
    if (b.action === "grant_monthly") patch = { plan: "premium", premium_until: addMonths(now, 1), credits: PREMIUM_CREDITS, next_renewal: addMonths(now, 1) };
    else if (b.action === "grant_yearly") patch = { plan: "premium", premium_until: addMonths(now, 12), credits: PREMIUM_CREDITS, next_renewal: addMonths(now, 1) };
    else if (b.action === "revoke") patch = { plan: "free", premium_until: null, next_renewal: null };
    else return json(res, 400, { error: "Unknown action" });
    const out = await adminRest("PATCH", "/rest/v1/profiles?id=eq." + b.user_id + "&select=*", patch);
    json(res, 200, { user: out && out[0] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
