// GET /api/admin/transactions -> all payment transactions
const { cors, json } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    const rows = await adminRest("GET", "/rest/v1/transactions?select=*&order=created_at.desc&limit=200");
    json(res, 200, { transactions: rows || [] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
