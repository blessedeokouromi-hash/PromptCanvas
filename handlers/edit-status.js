// GET /api/edit-status?token=...&edit=...  -> poll a pending edit (reserved for async providers)
const { cors, bearer, json } = require("./lib/util");
const { who, adminRest, config } = require("./lib/supa");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req) || req.query.token, req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    const id = String(req.query.edit || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: "Bad edit id" });
    const rows = await adminRest("GET", "/rest/v1/edits?id=eq." + id + "&user_id=eq." + user.id + "&select=*");
    const r = rows && rows[0];
    if (!r) return json(res, 404, { error: "Edit not found" });
    const cfg = await config(req.headers.host);
    json(res, 200, {
      status: r.status,
      url: r.output_path ? cfg.url + "/storage/v1/object/public/canvas/" + r.output_path : null
    });
  } catch (e) { json(res, 500, { error: e.message }); }
};
