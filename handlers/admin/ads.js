// GET  /api/admin/ads -> current ad placements
// POST /api/admin/ads { banner, native, socialbar, popunder } -> update placements
const { cors, json, readJson } = require("../lib/util");
const { adminOnly } = require("../lib/admin");
const { adminRest } = require("../lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const admin = await adminOnly(req, res);
  if (!admin) return;
  try {
    if (req.method === "GET") {
      const rows = await adminRest("GET", "/rest/v1/ads_config?id=eq.1&select=*");
      json(res, 200, { ads: rows && rows[0] });
      return;
    }
    const b = await readJson(req, 4);
    const banners = { banner: String(b.banner || ""), native: String(b.native || ""), socialbar: String(b.socialbar || ""), popunder: String(b.popunder || "") };
    const out = await adminRest("PATCH", "/rest/v1/ads_config?id=eq.1&select=*", { banners, updated_at: new Date().toISOString() });
    json(res, 200, { ads: out && out[0] });
  } catch (e) { json(res, 500, { error: e.message }); }
};
