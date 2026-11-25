// POST /api/upload  { token, dataUrl } -> { path, url }
// The browser downsizes the image first; server caps at ~6 MB decoded.
const { cors, bearer, json, readJson, rateLimit } = require("./lib/util");
const { who } = require("./lib/supa");
const { upload } = require("./lib/storage");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    if (!rateLimit("up:" + user.id, 20, 60000)) return json(res, 429, { error: "Too many uploads, wait a moment" });
    const body = await readJson(req, 10);
    const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || "");
    if (!m) return json(res, 400, { error: "Send the image as a base64 data URL (png/jpeg/webp)" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length < 500) return json(res, 400, { error: "Image is empty or too small" });
    if (buf.length > 6 * 1024 * 1024) return json(res, 400, { error: "Image too large (max 6 MB)" });
    const path = "uploads/" + user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + (m[1].includes("png") ? "png" : m[1].includes("webp") ? "webp" : "jpg");
    const url = await upload(path, buf, m[1]);
    json(res, 200, { path, url });
  } catch (e) { json(res, 500, { error: e.message }); }
};
