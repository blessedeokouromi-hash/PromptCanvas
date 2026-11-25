// GET /api/payments/history -> the user's own transactions
const { cors, bearer, json } = require("../lib/util");
const { who, adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    const rows = await adminRest("GET",
      "/rest/v1/transactions?user_id=eq." + user.id + "&select=provider,reference,plan,amount,currency,status,created_at&order=created_at.desc&limit=50");
    json(res, 200, { transactions: rows || [] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
