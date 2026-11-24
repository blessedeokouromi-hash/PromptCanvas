// GET /api/admin/stats -> platform statistics (computed from real tables only)
const { cors, json } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    const [users, prem, edits, txs, eds24] = await Promise.all([
      adminRest("GET", "/rest/v1/profiles?select=id"),
      adminRest("GET", "/rest/v1/profiles?plan=eq.premium&premium_until=gte." + new Date().toISOString() + "&select=id"),
      adminRest("GET", "/rest/v1/edits?select=id,credits_spent,created_at,status"),
      adminRest("GET", "/rest/v1/transactions?status=eq.success&select=amount"),
      adminRest("GET", "/rest/v1/edits?created_at=gte." + new Date(Date.now() - 864e5).toISOString() + "&select=id")
    ]);
    const totalNaira = (txs || []).reduce((s, t) => s + (t.amount || 0), 0) / 100;
    json(res, 200, {
      users: (users || []).length,
      premium_active: (prem || []).length,
      total_edits: (edits || []).length,
      failed_edits: (edits || []).filter(e => e.status === "failed").length,
      edits_last_24h: (eds24 || []).length,
      revenue_naira: totalNaira,
      successful_payments: (txs || []).length
    });
  } catch (e) { json(res, 500, { error: e.message }); }
};
