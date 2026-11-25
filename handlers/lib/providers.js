// AI provider adapters. Every adapter makes a REAL network call to a real AI
// service and returns a Buffer of image bytes. Nothing is simulated here.
// - Pollinations flux: free text-to-image with NO key (background generation).
// - Pollinations kontext: real prompt-based image EDITING; needs a free
//   "pollen" token from https://enter.pollinations.ai (POLLINATIONS_TOKEN), or
//   falls back to Replicate (black-forest-labs/flux-kontext-dev).
// - remove.bg: real AI background removal (REMOVEBG_KEY).
// - Replicate: real upscaling (Real-ESRGAN) + object removal (LaMa) (REPLICATE_API_TOKEN).


async function needsResult(r, service) {
  if (r.ok) return;
  let body = "";
  try { body = ", response: " + (await r.text()).slice(0, 160); } catch (e) {}
  if (r.status === 402) throw new Error(service + " is out of credits for this key" + body);
  if (r.status === 401 || r.status === 403) throw new Error(service + " rejected the API key (HTTP " + r.status + ")" + body);
  throw new Error(service + " error (HTTP " + r.status + ")" + body);
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 110000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

async function pollinationsToken() {
  if (process.env.POLLINATIONS_TOKEN) return process.env.POLLINATIONS_TOKEN;
  return null;
}

// text-to-image with Flux (no key needed), or image-to-image with Kontext (key needed).
async function pollinations(kind, prompt, imageUrl, dims) {
  const p = encodeURIComponent((prompt || "").slice(0, 800));
  const w = Math.min(dims && dims.width || 1024, 2048);
  const h = Math.min(dims && dims.height || 1024, 2048);
  const token = await pollinationsToken();
  let url = "https://image.pollinations.ai/prompt/" + p +
    "?model=" + (imageUrl ? "kontext" : "flux") +
    "&width=" + w + "&height=" + h + "&nologo=true&enhance=false";
  if (imageUrl) url += "&image=" + encodeURIComponent(imageUrl);
  if (token) url += "&token=" + encodeURIComponent(token);
  if (imageUrl && !token) throw new Error(
    "Prompt-based editing needs a free Pollinations AI token. Create one at enter.pollinations.ai and save it as POLLINATIONS_TOKEN in the project settings. (Background generation works without any key.)");
  const headers = token ? { Authorization: "Bearer " + token } : {};
  url += "&referrer=promptcanvas";
  let r = await fetchWithTimeout(url, { method: "GET", headers }, 110000);
  // The free tier rate-limits per IP (~1 image/minute); spaced retries absorb that.
  if ((r.status === 402 || r.status === 429 || r.status === 503) && !imageUrl) {
    for (const wait of [20000, 40000]) {
      await new Promise(res => setTimeout(res, wait));
      r = await fetchWithTimeout(url, { method: "GET", headers }, 110000);
      if (r.ok) break;
    }
  }
  await needsResult(r, "Pollinations AI");
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error("Pollinations AI returned an empty image");
  return buf;
}

// Replicate fallback for prompt editing when no Pollinations token exists.
async function replicateEdit(imageUrl, prompt) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  const out = await replicateRun(process.env.REPLICATE_EDIT_MODEL || "black-forest-labs/flux-kontext-dev",
    { input_image: imageUrl, prompt });
  return out;
}

// ---------- remove.bg (real background removal, key required) ----------
async function removeBg(imageUrl) {
  const key = process.env.REMOVEBG_KEY;
  if (!key) throw new Error("Background removal needs the remove.bg API key (REMOVEBG_KEY). Save it in the project settings and this tool turns on.");
  const fd = new FormData();
  fd.append("image_url", imageUrl);
  fd.append("size", "auto");
  fd.append("format", "png");
  const r = await fetchWithTimeout("https://api.remove.bg/v1.0/removebg", {
    method: "POST", headers: { "X-Api-Key": key }, body: fd
  }, 90000);
  await needsResult(r, "remove.bg");
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error("remove.bg returned an empty image");
  return buf;
}

// ---------- Replicate (upscaling + object removal, token required) ----------
async function replicateRun(model, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null; // caller decides the message
  const r0 = await fetchWithTimeout("https://api.replicate.com/v1/models/" + model + "/predictions", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ input })
  }, 30000);
  await needsResult(r0, "Replicate");
  let pred = await r0.json();
  const started = Date.now();
  while (pred && pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled" && Date.now() - started < 90000) {
    await new Promise(res => setTimeout(res, 2500));
    const r = await fetchWithTimeout("https://api.replicate.com/v1/predictions/" + pred.id, {
      headers: { Authorization: "Bearer " + token }
    }, 20000);
    if (!r.ok) throw new Error("Replicate polling error (HTTP " + r.status + ")");
    pred = await r.json();
  }
  if (!pred || pred.status !== "succeeded") throw new Error("Replicate did not finish in time (" + (pred && pred.status) + ")");
  const out = pred.output;
  const outUrl = Array.isArray(out) ? out[out.length - 1] : out;
  if (!outUrl) throw new Error("Replicate returned no image");
  const r2 = await fetchWithTimeout(outUrl, {}, 60000);
  if (!r2.ok) throw new Error("Could not download the Replicate result");
  return Buffer.from(await r2.arrayBuffer());
}

async function upscale(imageUrl, uid, scale) {
  try {
    const buf = await replicateRun(process.env.REPLICATE_UPSCALE_MODEL || "nightmareai/real-esrgan",
      { image: imageUrl, scale: Number(scale) || 2, face_enhance: false });
    if (!buf) throw new Error("no-token");
    return buf;
  } catch (e) {
    if (e.message === "no-token") throw new Error("Upscaling needs a Replicate API token (REPLICATE_API_TOKEN). Save it in the project settings and this tool turns on.");
    throw e;
  }
}

async function objectRemove(imageUrl, maskUrl) {
  try {
    const buf = await replicateRun(process.env.REPLICATE_INPAINT_MODEL || "cjwbw/lama",
      { image: imageUrl, mask: maskUrl });
    if (!buf) throw new Error("no-token");
    return buf;
  } catch (e) {
    if (e.message === "no-token") throw new Error("Object removal needs a Replicate API token (REPLICATE_API_TOKEN). Save it in the project settings and this tool turns on.");
    throw e;
  }
}

module.exports = { pollinations, removeBg, upscale, objectRemove, replicateEdit, storeResult: null };
