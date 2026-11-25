// POST /api/edit  { token, kind, prompt?, input_path?, mask_path?, width?, height? }
// Kinds: prompt_edit | bg_replace | bg_generate | portrait | img2img | bg_remove | upscale | object_remove
// Flow: verify token -> claim 1 credit ATOMICALLY (in the database) -> run the real
// AI call -> on success store + log the edit; on failure REFUND the credit.
const { cors, bearer, json, readJson, rateLimit } = require("./lib/util");
const { who, adminRest, config } = require("./lib/supa");
const providers = require("./lib/providers");

const KINDS = ["prompt_edit", "bg_replace", "bg_generate", "portrait", "img2img", "bg_remove", "upscale", "object_remove", "animate"];

function finalPrompt(kind, prompt) {
  const p = (prompt || "").trim();
  switch (kind) {
    case "prompt_edit": return p || "enhance this image naturally";
    case "img2img": return p || "restyle this image creatively";
    case "portrait": return (p ? p + ", " : "") + "professional portrait retouch, flattering studio lighting, sharp focus on the face, natural skin tones";
    case "bg_replace": return "completely replace the background with: " + (p || "a clean modern studio backdrop") + ". Keep the main subject exactly as it is, same pose, same face, same clothes, cut out cleanly and blend realistically with the new background";
    case "bg_remove": return "";
    case "bg_generate": return p || "seamless abstract gradient background texture, high quality, no text";
    default: return p;
  }
}

function publicUrlFor(path) {
  return null; // filled by the caller from the project URL
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    if (!rateLimit("ed:" + user.id, 12, 60000)) return json(res, 429, { error: "Too many edits at once, wait a few seconds" });
    const body = await readJson(req, 2);
    const kind = body.kind;
    if (!KINDS.includes(kind)) return json(res, 400, { error: "Unknown editing action" });
    const cost = kind === "animate" ? 5 : 1; // AI video costs real money per clip

    // ---- Atomic credit claim (SQL function: free daily reset + premium check) ----
    const claimed = await adminRest("POST", "/rest/v1/rpc/claim_credit",
      { p_uid: user.id, p_cost: cost });
    // PostgREST returns [true] / [false]
    const ok = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!ok) return json(res, 402, { error: "No credits left. Free accounts get 2 every day; Premium gets 100 every month." });

    const cfg = await config(req.headers.host);
    let resultUrl = null, usedProvider = "", failed = null;

    try {
      const storageBase = cfg.url + "/storage/v1/object/public/canvas/";
      const inputUrl = body.input_path ? storageBase + body.input_path : null;
      const maskUrl = body.mask_path ? storageBase + body.mask_path : null;
      let bytes, ctype = "image/jpeg";

      switch (kind) {
        case "bg_remove":
          if (!inputUrl) throw new Error("Upload an image first");
          bytes = await providers.removeBg(inputUrl, user.id); ctype = "image/png"; usedProvider = "remove.bg";
          break;
        case "upscale":
          if (!inputUrl) throw new Error("Upload an image first");
          bytes = await providers.upscale(inputUrl, user.id, body.scale || 2); usedProvider = "Replicate Real-ESRGAN";
          break;
        case "object_remove":
          if (!inputUrl) throw new Error("Upload an image first");
          if (!maskUrl) throw new Error("Brush over the object you want removed first");
          bytes = await providers.objectRemove(inputUrl, maskUrl, user.id); usedProvider = "Replicate LaMa inpainting";
          break;
        case "animate":
          if (!inputUrl) throw new Error("Upload an image first");
          bytes = await providers.animate(inputUrl, body.prompt); ctype = "video/mp4"; usedProvider = "Replicate Wan 2.2 video";
          break;
        case "bg_generate":
          bytes = await providers.pollinations("bg_generate", finalPrompt(kind, body.prompt), null, body); usedProvider = "Pollinations Flux";
          break;
        default: {
          if (!inputUrl) throw new Error("Upload an image first");
          try {
            bytes = await providers.pollinations(kind, finalPrompt(kind, body.prompt), inputUrl, body);
            usedProvider = "Pollinations Kontext";
          } catch (e1) {
            const alt = await providers.replicateEdit(inputUrl, finalPrompt(kind, body.prompt));
            if (!alt) throw e1;
            bytes = alt; usedProvider = "Replicate Kontext";
          }
        }
      }

      const ext = ctype.includes("png") ? "png" : (ctype.includes("video") ? "mp4" : "jpg");
      const outPath = "results/" + user.id + "/" + kind + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      // bytes -> storage
      const { upload } = require("./lib/storage");
      await upload(outPath, bytes, ctype);
      resultUrl = storageBase + outPath;

      const row = await adminRest("POST", "/rest/v1/edits",
        { user_id: user.id, kind, prompt: body.prompt || null, input_path: body.input_path || null,
          output_path: outPath, status: "done", credits_spent: cost, provider: usedProvider });
      const editId = row && row[0] && row[0].id;
      json(res, 200, { ok: true, edit_id: editId, url: resultUrl, provider: usedProvider });
    } catch (e) {
      failed = e.message;
      // ---- Refund the credit: processing failed, the user keeps their credit ----
      try { await adminRest("POST", "/rest/v1/rpc/refund_credit", { p_uid: user.id, p_cost: cost }); } catch (e2) {}
      json(res, 502, { error: failed, refunded: true });
    }
  } catch (e) { json(res, 500, { error: e.message }); }
};
