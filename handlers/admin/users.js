// GET  /api/admin/users?q=      -> list users (search by email)
const { cors, json } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    const q = String(req.query.q || "").replace(/[%,()]/g, "");
    let url = "/rest/v1/profiles?select=*&order=created_at.desc&limit=200";
    if (q) url = "/rest/v1/profiles?email=ilike.*" + encodeURIComponent(q) + "*&select=*&order=created_at.desc&limit=200";
    const rows = await adminRest("GET", url);
    json(res, 200, { users: rows || [] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
