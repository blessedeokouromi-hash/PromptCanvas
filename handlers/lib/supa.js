// Supabase helpers. Public config comes from supabase-config.json in the repo
// root (served on the site), the service-role key NEVER leaves env vars.
const CFG_PATHS = ["/supabase-config.json", "/auth-config.json"];
let cfgCache = null, cfgTried = 0;

async function config(host) {
  if (cfgCache && Date.now() - cfgTried < 300000) return cfgCache;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    cfgCache = { url: process.env.SUPABASE_URL.replace(/\/$/, ""), key: process.env.SUPABASE_ANON_KEY };
    cfgTried = Date.now();
    return cfgCache;
  }
  for (const p of CFG_PATHS) {
    try {
      const r = await fetch("https://" + host + p, { headers: { "Cache-Control": "no-cache" } });
      if (!r.ok) continue;
      const c = await r.json();
      if (c && c.url && (c.key || c.anonKey)) {
        cfgCache = { url: c.url.replace(/\/$/, ""), key: c.key || c.anonKey };
        cfgTried = Date.now();
        return cfgCache;
      }
    } catch (e) {}
  }
  return null;
}

function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; }

// Verify a user's Supabase access token; returns { id, email } or null.
async function who(token, host) {
  if (!token || typeof token !== "string") return null;
  const cfg = await config(host);
  if (!cfg) return null;
  try {
    const r = await fetch(cfg.url + "/auth/v1/user", {
      headers: { apikey: cfg.key, Authorization: "Bearer " + token }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id && u.email ? { id: u.id, email: u.email } : null;
  } catch (e) { return null; }
}

// Authenticated admin REST call against Supabase (PostgREST) using the service key.
async function adminRest(method, path, body) {
  const cfg = await config(null); // server-side: needs env URL or cached config
  if (!cfg) throw new Error("Supabase is not configured");
  const sk = serviceKey();
  if (!sk) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const r = await fetch(cfg.url + path, {
    method,
    headers: {
      apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json",
      Prefer: method === "POST" || method === "PATCH" ? "return=representation" : undefined
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) throw new Error("Supabase " + method + " " + path + " -> " + r.status + (json && json.message ? ": " + json.message : ""));
  return json;
}

async function getProfile(uid) {
  const rows = await adminRest("GET", "/rest/v1/profiles?id=eq." + uid + "&select=*");
  return rows && rows[0] || null;
}

async function updateProfile(uid, patch) {
  return adminRest("PATCH", "/rest/v1/profiles?id=eq." + uid, patch);
}

// Read config with an explicit host (for request-scoped calls).
async function configFor(host) { return config(host); }

module.exports = { config, configFor, who, adminRest, getProfile, updateProfile, serviceKey };
