// Supabase Storage: one public bucket "canvas" for uploads and AI outputs.
const { adminRest, serviceKey, config } = require("./supa");
const BUCKET = "canvas";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return true;
  try {
    const cfg = await config(null);
    const sk = serviceKey();
    if (!cfg || !sk) return false;
    const r = await fetch(cfg.url + "/storage/v1/bucket", {
      method: "POST",
      headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, fileSizeLimit: 10485760 })
    });
    const j = await r.json ? await r.json().catch(() => ({})) : {};
    // 400 "already exists" is fine.
    bucketReady = r.ok || (j && /exist/i.test(j.message || ""));
    return bucketReady;
  } catch (e) { return false; }
}

async function upload(path, buffer, contentType) {
  if (!(await ensureBucket())) throw new Error("Storage not configured");
  const cfg = await config(null);
  const sk = serviceKey();
  const r = await fetch(cfg.url + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": contentType || "image/jpeg", "x-upsert": "true" },
    body: buffer
  });
  if (!r.ok) throw new Error("Storage upload failed (" + r.status + ")");
  return cfg.url + "/storage/v1/object/public/" + BUCKET + "/" + path;
}

function publicUrl(path) {
  return path ? null : null; // URL is built by upload()
}

module.exports = { upload, ensureBucket, BUCKET };
