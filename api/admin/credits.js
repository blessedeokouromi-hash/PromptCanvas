// POST /api/admin/credits  { user_id, set?: number, add?: number }
const { cors, json, readJson } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    const b = await readJson(req, 1);
    if (!b.user_id) return json(res, 400, { error: "user_id required" });
    let patch;
    if (typeof b.add === "number") patch = { credits: Math.max(0, b.add) }; // PostgREST can't do arithmetic; fetch then set
    else if (typeof b.set === "number") patch = { credits: Math.max(0, Math.floor(b.set)) };
    else return json(res, 400, { error: "set or add required" });
    if (typeof b.add === "number") {
      const rows = await adminRest("GET", "/rest/v1/profiles?id=eq." + b.user_id + "&select=credits");
      if (!rows || !rows[0]) return json(res, 404, { error: "User not found" });
      patch = { credits: Math.max(0, rows[0].credits + Math.floor(b.add)) };
    }
    const out = await adminRest("PATCH", "/rest/v1/profiles?id=eq." + b.user_id + "&select=*", patch);
    json(res, 200, { user: out && out[0] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
