// GET /api/ads  -> { premium, banners }
// The browser only injects Adsterra code when the signed-in user is on free.
const { cors, bearer, json } = require("./lib/util");
const { who, adminRest, getProfile } = require("./lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    let premium = false;
    const token = bearer(req);
    if (token) {
      const user = await who(token, req.headers.host);
      if (user) {
        const p = await getProfile(user.id);
        premium = !!(p && p.plan === "premium" && p.premium_until && new Date(p.premium_until) > new Date());
      }
    }
    let banners = {};
    try {
      const rows = await adminRest("GET", "/rest/v1/ads_config?id=eq.1&select=banners");
      if (rows && rows[0] && rows[0].banners) banners = rows[0].banners;
    } catch (e) {}
    json(res, 200, { premium, banners });
  } catch (e) { json(res, 500, { error: e.message }); }
};
