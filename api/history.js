// GET /api/history  -> the signed-in user's editing history (newest first)
const { cors, bearer, json } = require("./lib/util");
const { who, adminRest } = require("./lib/supa");
const { config } = require("./lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    const cfg = await config(req.headers.host);
    // PostgREST through the service key, filtered server-side by user id.
    const rows = await adminRest("GET",
      "/rest/v1/edits?user_id=eq." + user.id + "&select=*&order=created_at.desc&limit=60");
    // Convert stored storage paths to public URLs for display.
    const out = (rows || []).map(r => ({
      id: r.id, kind: r.kind, prompt: r.prompt, status: r.status,
      credits_spent: r.credits_spent, created_at: r.created_at,
      input_path: r.input_path, output_path: r.output_path,
      output_url: r.output_path ? cfg.url + "/storage/v1/object/public/canvas/" + r.output_path : null
    }));
    json(res, 200, { edits: out });
  } catch (e) { json(res, 500, { error: e.message }); }
};
