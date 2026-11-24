// In-memory emulator of the Supabase endpoints the app uses, for integration
// testing the REAL handlers locally. Mirrors the SQL semantics of claim_credit,
// refund_credit and renew_subscriptions from supabase/schema.sql.
const http = require("http");
const crypto = require("crypto");
const URL = require("url");

const state = { users:{}, profiles:{}, edits:[], txs:[], ads:{ banner:"", native:"", socialbar:"", popunder:"" }, storage:{}, tokens:{} };
const ANON = "test-anon-key";

function today(){ return new Date().toISOString().slice(0,10); }
function createAuthUser(email, password){
  const id = crypto.randomUUID();
  state.users[id] = { id, email, password };
  state.profiles[id] = { id, email, credits: 2, plan: "free", premium_until: null, next_renewal: null, last_daily_reset: null, is_admin: false, created_at: new Date().toISOString() };
  return id;
}
function sessionFor(id){
  const token = crypto.randomBytes(24).toString("hex");
  state.tokens[token] = id;
  return { access_token: token, user: { id, email: state.users[id].email } };
}
function userForToken(t){ return state.tokens[t] || null; }

// Mirror of the SQL claim_credit
function claimCredit(uid, cost){
  const p = state.profiles[uid]; if (!p) return false;
  const isPrem = p.plan === "premium" && p.premium_until && new Date(p.premium_until) > new Date();
  if (isPrem) { if (p.credits < cost) return false; }
  else {
    if (!p.last_daily_reset || p.last_daily_reset < today()) { p.credits = 2; p.last_daily_reset = today(); }
    if (p.credits < cost) return false;
  }
  p.credits -= cost; return true;
}
function refundCredit(uid, cost){ const p = state.profiles[uid]; if (p) p.credits += cost; }
function renewSubscriptions(){
  let n = 0;
  for (const p of Object.values(state.profiles)) {
    if (p.plan === "premium" && p.premium_until && new Date(p.premium_until) <= new Date()) { p.plan = "free"; p.premium_until = null; p.next_renewal = null; }
    else if (p.plan === "premium" && p.premium_until && new Date(p.premium_until) > new Date() && p.next_renewal && new Date(p.next_renewal) <= new Date()) {
      p.credits = 100; p.next_renewal = new Date(new Date(p.next_renewal).getTime() + 30*864e5).toISOString(); n++;
    }
  }
  return n;
}
function filter(rows, qs){
  let out = rows;
  for (const [field, raw] of Object.entries(qs)) {
    if (["select","order","limit"].includes(field)) continue;
    const m = /^(eq|gte|lte|ilike)\.(.*)$/.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    out = out.filter(r => {
      let rv = r[field];
      if (op === "eq") return String(rv) === val;
      if (op === "gte") return new Date(rv) >= new Date(val);
      if (op === "lte") return new Date(rv) <= new Date(val);
      if (op === "ilike") return String(rv).toLowerCase().includes(val.replace(/\*/g,"").toLowerCase());
      return true;
    });
  }
  return out;
}
function body(req){ return new Promise(res => { const c=[]; req.on("data",d=>c.push(d)); req.on("end",()=>res(Buffer.concat(c))); }); }

async function handler(req, res){
  const u = new URL.parse(req.url, true);
  const p = req.url; // keep the query string; rest-path logic parses it manually
  const q = u.query;
  const j = (code, obj) => { res.writeHead(code, {"Content-Type":"application/json"}); res.end(JSON.stringify(obj)); };

  if (p === "/auth/v1/signup" && req.method === "POST") {
    const b = JSON.parse(await body(req));
    for (const usr of Object.values(state.users)) if (usr.email === b.email) return j(400, { msg: "User already registered" });
    const id = createAuthUser(b.email, b.password);
    return j(200, sessionFor(id));
  }
  if (p.split("?")[0] === "/auth/v1/token" && req.method === "POST") {
    const b = JSON.parse(await body(req));
    for (const usr of Object.values(state.users)) if (usr.email === b.email && usr.password === b.password) return j(200, sessionFor(usr.id));
    return j(400, { error_description: "Invalid login credentials" });
  }
  if (p === "/auth/v1/user" && req.method === "GET") {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    const id = userForToken(t);
    if (!id) return j(401, { msg: "Invalid token" });
    return j(200, { id, email: state.users[id].email });
  }

  if (p.startsWith("/rest/v1/")) {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    const isAdmin = true; // emulator treats service key calls as admin
    if (!isAdmin && !userForToken(t)) return j(401, { msg: "Invalid token" });
    const raw = await body(req);
    const payload = raw.length ? JSON.parse(raw.toString()) : null;

    if (p === "/rest/v1/rpc/claim_credit") return j(200, [claimCredit(payload.p_uid, payload.p_cost)]);
    if (p === "/rest/v1/rpc/refund_credit") { refundCredit(payload.p_uid, payload.p_cost); return j(204, {}); }
    if (p === "/rest/v1/rpc/renew_subscriptions") return j(200, [renewSubscriptions()]);

    let table = p.replace("/rest/v1/", "").split("?")[0];
    const qs = {};
    const qi = p.indexOf("?");
    if (qi > 0) for (const kv of p.slice(qi+1).split("&")) { const [k, v] = kv.split("="); qs[decodeURIComponent(k)] = decodeURIComponent(v); }

    if (table === "profiles") {
      if (req.method === "GET") {
        let rows = Object.values(state.profiles);
        if (qs.id) {  }
        return j(200, filter(rows, qs));
      }
      if (req.method === "POST") { const id = payload.id; state.profiles[id] = Object.assign({ credits:2, plan:"free" }, payload); return j(201, [state.profiles[id]]); }
      if (req.method === "PATCH") {
        let target = null;
        const m = /id=eq\.([0-9a-f-]+)/.exec(p);
        if (m) target = state.profiles[m[1]];
        if (!target) return j(404, {});
        Object.assign(target, payload);
        return j(200, [target]);
      }
    }
    if (table === "edits") {
      if (req.method === "GET") return j(200, filter(state.edits, qs));
      if (req.method === "POST") { const row = Object.assign({ id: crypto.randomUUID(), status:"done", credits_spent:1, created_at:new Date().toISOString() }, payload); state.edits.unshift(row); return j(201, [row]); }
    }
    if (table === "transactions") {
      if (req.method === "GET") {
        let rows = state.txs;
        const mr = /reference=eq\.([^&]+)/.exec(p);
        if (mr) rows = rows.filter(r => r.reference === decodeURIComponent(mr[1]));
        return j(200, filter(rows, qs));
      }
      if (req.method === "POST") { const row = Object.assign({ id: crypto.randomUUID(), status:"pending", created_at:new Date().toISOString() }, payload); state.txs.push(row); return j(201, [row]); }
      if (req.method === "PATCH") {
        const mr = /reference=eq\.([^&]+)/.exec(p);
        const row = state.txs.find(r => mr && r.reference === decodeURIComponent(mr[1]));
        if (!row) return j(404, {});
        Object.assign(row, payload); return j(200, [row]);
      }
    }
    if (table === "ads_config") {
      if (req.method === "GET") return j(200, [{ id:1, banners: state.ads, updated_at:new Date().toISOString() }]);
      if (req.method === "PATCH") { state.ads = Object.assign({}, state.ads, payload.banners || payload); return j(200, [{ id:1, banners: state.ads }]); }
    }
    return j(404, { message: "unknown rest path " + p });
  }

  if (p === "/storage/v1/bucket" && req.method === "POST") { await body(req); return j(200, { name: "canvas" }); }
  const up = p.match(/^\/storage\/v1\/object\/canvas\/(.+)$/);
  if (up && req.method === "POST") { const raw = await body(req); state.storage[up[1]] = raw; return j(200, { key: up[1] }); }
  const pub = p.match(/^\/storage\/v1\/object\/public\/canvas\/(.+)$/);
  if (pub && req.method === "GET") {
    const data = state.storage[pub[1]];
    if (!data) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(data);
  }
  j(404, { message: "unknown " + p });
}

module.exports = { createServer(port){ return http.createServer(handler).listen(port); }, state, createAuthUser, sessionFor, userForToken, ANON };
module.exports.handler = handler;
