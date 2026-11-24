// Admin gate: the caller must be a signed-in user whose email is in ADMIN_EMAILS.
const { who, getProfile } = require("./supa");
const { json, bearer } = require("./util");

async function adminOnly(req, res) {
  const user = await who(bearer(req), req.headers.host);
  if (!user) { json(res, 401, { error: "Not signed in" }); return null; }
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const p = await getProfile(user.id);
  const ok = allowed.includes(user.email.toLowerCase()) || (p && p.is_admin);
  if (!ok) { json(res, 403, { error: "Admin access required" }); return null; }
  return user;
}
module.exports = { adminOnly };
