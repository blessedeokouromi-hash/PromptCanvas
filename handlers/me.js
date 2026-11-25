// GET /api/me  (Authorization: Bearer <supabase token>)
// Returns the signed-in user's profile: credits, plan, premium expiry.
const { cors, bearer, json } = require("./lib/util");
const { who, adminRest, getProfile } = require("./lib/supa");
const { FREE_DAILY_CREDITS } = require("./lib/plans");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    let p = await getProfile(user.id);
    if (!p) {
      await adminRest("POST", "/rest/v1/profiles", { id: user.id, email: user.email });
      p = await getProfile(user.id);
    }
    // Free-plan daily reset (display + authoritative reset also happens in claim_credit).
    const today = new Date().toISOString().slice(0, 10);
    const isPremium = p.plan === "premium" && p.premium_until && new Date(p.premium_until) > new Date();
    if (!isPremium && p.last_daily_reset !== today) {
      await adminRest("PATCH", "/rest/v1/profiles?id=eq." + user.id,
        { credits: FREE_DAILY_CREDITS, last_daily_reset: today });
      p.credits = FREE_DAILY_CREDITS; p.last_daily_reset = today;
    }
    json(res, 200, {
      id: user.id, email: user.email,
      credits: p.credits, plan: isPremium ? "premium" : "free",
      premium_until: isPremium ? p.premium_until : null,
      next_renewal: p.next_renewal || null,
      is_admin: !!p.is_admin
    });
  } catch (e) { json(res, 500, { error: e.message }); }
};
