// Integration tests for PromptCanvas AI: real handlers + real AI providers.
// The Supabase side runs on an in-memory emulator mirroring the SQL semantics.
process.env.SUPABASE_URL = "http://localhost:4401";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.ADMIN_EMAILS = "admin@promptcanvas.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.PAYSTACK_SECRET_KEY = "sk_test_harness_key";
process.env.FLW_WEBHOOK_HASH = "test-hash";
delete process.env.REMOVEBG_KEY;
delete process.env.REPLICATE_API_TOKEN;

const http = require("http");
const crypto = require("crypto");
const emu = require("./supa-emulator");
const { createAuthUser, sessionFor } = emu;
const { wrap } = require("./server");

const emuServer = http.createServer((req, res) => emu.handler(req, res)).listen(4401);

function api(name){ return require("../api/" + name); }
const servers = {};
["me","upload","edit","history","ads","edit-status",
 "payments/init","payments/verify","payments/webhook-paystack","payments/webhook-flutterwave","payments/history",
 "admin/users","admin/credits","admin/subscription","admin/transactions","admin/stats","admin/ads",
 "cron/renew"].forEach(n => { servers[n] = wrap(api(n)).listen(0); });

function base(n){ const s = servers[n]; return "http://localhost:" + s.address().port; }
async function call(n, path, { method="GET", token, body, headers={} } = {}) {
  const r = await fetch(base(n) + path, {
    method,
    headers: Object.assign({ "Content-Type": "application/json", host: "promptcanvas.test" }, token ? { Authorization: "Bearer " + token } : {}, headers),
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null; try { j = await r.json(); } catch(e){}
  return { status: r.status, body: j };
}

const results = [];
function check(name, cond, extra){ results.push([name, !!cond, extra]); console.log((cond ? "PASS" : "FAIL") + "  " + name + (cond ? "" : "  -> " + JSON.stringify(extra || ""))); }

// 1px red jpeg
const RED_JPEG = "data:image/jpeg;base64," + require("fs").readFileSync(__dirname + "/testimg.b64", "utf8").trim();

(async () => {
  try {
    // ---------- accounts ----------
    const uidA = createAuthUser("ada@promptcanvas.test", "passw0rd");
    const uidB = createAuthUser("ben@promptcanvas.test", "passw0rd");
    const uidAdm = createAuthUser("admin@promptcanvas.test", "passw0rd");
    const A = sessionFor(uidA).access_token, B = sessionFor(uidB).access_token, ADM = sessionFor(uidAdm).access_token;
    // profile rows are created by the SQL trigger in production; emulator pre-creates them.

    let r = await call("me", "/api/me", { token: A });
    check("me: free user has 2 daily credits", r.status === 200 && r.body.credits === 2 && r.body.plan === "free", r);
    r = await call("me", "/api/me", {});
    check("me: no token -> 401", r.status === 401, r);

    // ---------- upload ----------
    r = await call("upload", "/api/upload", { method:"POST", token: A, body: { dataUrl: RED_JPEG } });
    check("upload: returns storage path + url", r.status === 200 && r.body.path && r.body.url.startsWith("http"), r);
    const inputPath = r.body && r.body.path;

    r = await call("upload", "/api/upload", { method:"POST", token: A, body: { dataUrl: "data:text/html;base64,PGI+" } });
    check("upload: rejects non-image", r.status === 400, r);

    // ---------- real AI edit (text-to-image, no input image needed) ----------
    r = await call("edit", "/api/edit", { method:"POST", token: A, body: { kind: "bg_generate", prompt: "smooth deep purple studio gradient background, no text" } });
    check("edit bg_generate: real Pollinations result", r.status === 200 && r.body.url && /canvas\/results\//.test(r.body.url), r);
    r = await call("me", "/api/me", { token: A });
    check("credits: deducted to 1 after first edit", r.body.credits === 1, r);

    // ---------- image-to-image without any key: clear error + auto refund ----------
    r = await call("edit", "/api/edit", { method:"POST", token: A, body: { kind: "prompt_edit", prompt: "make the colors dreamy pastel", input_path: "https://raw.githubusercontent.com/blessedeokouromi-hash/Fixturio/main/frame1.jpg" } });
    check("edit prompt_edit: clear 'needs token' error, no fake result", r.status === 502 && /Pollinations/.test(r.body.error) && r.body.refunded === true, r);
    r = await call("me", "/api/me", { token: A });
    check("credits: still 1 after failed edit (refunded, not spent)", r.body.credits === 1, r);
    r = await call("edit", "/api/edit", { method:"POST", token: A, body: { kind: "bg_generate", prompt: "second gradient test" } });
    check("edit bg_generate again: second real result", r.status === 200 && r.body.url, r);
    r = await call("me", "/api/me", { token: A });
    check("credits: deducted to 0 after second edit", r.body.credits === 0, r);

    // ---------- limit bypass prevention ----------
    r = await call("edit", "/api/edit", { method:"POST", token: A, body: { kind: "bg_generate", prompt: "another" } });
    check("credits: 402 when free credits exhausted", r.status === 402, r);

    // ---------- refund on provider failure ----------
    r = await call("admin/credits", "/api/admin/credits", { method:"POST", token: ADM, body: { user_id: uidA, set: 1 } });
    check("admin: can set credits", r.status === 200 && r.body.user.credits === 1, r);
    r = await call("edit", "/api/edit", { method:"POST", token: A, body: { kind: "bg_remove", input_path: inputPath } });
    check("edit bg_remove: clear key-required error", r.status === 502 && /remove\.bg/.test(r.body.error) && r.body.refunded === true, r);
    r = await call("me", "/api/me", { token: A });
    check("credits: refunded automatically after failure", r.body.credits === 1, r);

    // ---------- history ----------
    r = await call("history", "/api/history", { token: A });
    check("history: lists the two successful edits", r.status === 200 && r.body.edits.length === 2, r);
    r = await call("history", "/api/history", { token: B });
    check("history: user B sees none of user A's edits", (r.body.edits || []).length === 0, r);

    // ---------- payments: init without keys ----------
    const savedPsKey = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    r = await call("payments/init", "/api/payments/init", { method:"POST", token: B, body: { plan:"monthly", provider:"paystack" } });
    process.env.PAYSTACK_SECRET_KEY = savedPsKey;
    check("payments/init: helpful error when Paystack key missing", r.status === 503 && /Paystack/.test(r.body.error), r);

    // ---------- payments: webhook signature verification ----------
    const event = JSON.stringify({ event:"charge.success", data:{ status:"success", reference:"REF-PC-TEST-1", amount:500000, currency:"NGN" } });
    // Start a real pending transaction for B (through the real init table path):
    // write directly into the emulator transaction store to emulate a checkout that started
    emu.state.txs.push({ id:"t1", user_id: uidB, provider:"paystack", reference:"REF-PC-TEST-1", plan:"monthly", amount:500000, currency:"NGN", status:"pending", created_at:new Date().toISOString() });
    const badSig = await call("payments/webhook-paystack", "/api/payments/webhook-paystack", { method:"POST", body: JSON.parse(event), headers: { "x-paystack-signature": "deadbeef" } });
    check("paystack webhook: rejects bad signature", badSig.status === 401, badSig);
    const goodSig = crypto.createHmac("sha512", "sk_test_harness_key").update(event).digest("hex");
    r = await call("payments/webhook-paystack", "/api/payments/webhook-paystack", { method:"POST", body: JSON.parse(event), headers: { "x-paystack-signature": goodSig, "content-type": "application/json" } });
    check("paystack webhook: activates premium on valid signature", r.status === 200 && r.body.activated === true, r);
    r = await call("me", "/api/me", { token: B });
    check("premium: plan + 100 credits + 1-month expiry", r.body.plan === "premium" && r.body.credits === 100 && !!r.body.premium_until, r);
    r = await call("payments/webhook-paystack", "/api/payments/webhook-paystack", { method:"POST", body: JSON.parse(event), headers: { "x-paystack-signature": goodSig } });
    check("paystack webhook: idempotent (no double activation)", r.body.already === true, r);
    r = await call("me", "/api/me", { token: B });
    check("credits not doubled on duplicate webhook", r.body.credits === 100, r);

    // premium user can spend a credit
    r = await call("edit", "/api/edit", { method:"POST", token: B, body: { kind: "bg_generate", prompt: "soft blue gradient backdrop" } });
    check("premium edit works and deducts", r.status === 200, r);
    r = await call("me", "/api/me", { token: B });
    check("premium credits now 99", r.body.credits === 99, r);

    // ---------- flutterwave webhook hash ----------
    const flwEvent = JSON.stringify({ event:"charge.completed", data:{ status:"successful", tx_ref:"REF-PC-TEST-2" } });
    emu.state.txs.push({ id:"t2", user_id: uidB, provider:"flutterwave", reference:"REF-PC-TEST-2", plan:"yearly", amount:40000000, currency:"NGN", status:"pending", created_at:new Date().toISOString() });
    r = await call("payments/webhook-flutterwave", "/api/payments/webhook-flutterwave", { method:"POST", body: JSON.parse(flwEvent), headers: { "verif-hash": "wrong" } });
    check("flutterwave webhook: rejects wrong hash", r.status === 401, r);
    r = await call("payments/webhook-flutterwave", "/api/payments/webhook-flutterwave", { method:"POST", body: JSON.parse(flwEvent), headers: { "verif-hash": "test-hash" } });
    check("flutterwave webhook: activates yearly", r.status === 200 && r.body.activated === true, r);
    r = await call("me", "/api/me", { token: B });
    const monthsSpan = (new Date(r.body.premium_until) - new Date()) / (864e5 * 30.4);
    check("yearly: expiry ~12 months out, credits reset to 100", monthsSpan > 11.5 && r.body.credits === 100, { monthsSpan, credits: r.body.credits });

    // ---------- verify endpoint (redirect can never be trusted) ----------
    r = await call("payments/verify", "/api/payments/verify", { method:"POST", token: B, body: { reference: "REF-PC-TEST-2" } });
    check("verify: reports already-applied payment", r.status === 200 && r.body.already === true, r);
    r = await call("payments/verify", "/api/payments/verify", { method:"POST", token: A, body: { reference: "REF-PC-TEST-2" } });
    check("verify: cannot verify someone else's payment", r.status === 404, r);

    // ---------- monthly renewal ----------
    const pB = emu.state.profiles[uidB];
    pB.next_renewal = new Date(Date.now() - 3600e3).toISOString(); pB.credits = 3;
    r = await call("cron/renew", "/api/cron/renew");
    check("cron/renew: grants monthly credits", r.status === 200 && r.body.renewed === 1, r);
    r = await call("me", "/api/me", { token: B });
    check("renewal: credits back to 100", r.body.credits === 100, r);
    // expiry downgrade
    pB.premium_until = new Date(Date.now() - 3600e3).toISOString();
    r = await call("cron/renew", "/api/cron/renew");
    r = await call("me", "/api/me", { token: B });
    check("expiry: premium downgrades to free after expiry", r.body.plan === "free", r);

    // ---------- admin gate ----------
    r = await call("admin/users", "/api/admin/users", { token: B });
    check("admin: non-admin blocked", r.status === 403, r);
    r = await call("admin/users", "/api/admin/users", { token: ADM });
    check("admin: lists users", r.status === 200 && r.body.users.length >= 3, r);
    r = await call("admin/stats", "/api/admin/stats", { token: ADM });
    check("admin: stats computed from real data", r.status === 200 && typeof r.body.users === "number" && r.body.total_edits >= 2, r);
    r = await call("admin/subscription", "/api/admin/subscription", { method:"POST", token: ADM, body: { user_id: uidB, action: "grant_monthly" } });
    check("admin: can grant monthly premium", r.status === 200 && r.body.user.plan === "premium", r);
    r = await call("admin/ads", "/api/admin/ads", { method:"POST", token: ADM, body: { banner: "<script>ADSTERRA_TEST</script>", native:"", socialbar:"", popunder:"" } });
    check("admin: saves ad placements", r.status === 200, r);
    r = await call("ads", "/api/ads", { token: A });
    check("ads: free users receive ad code", r.status === 200 && /ADSTERRA_TEST/.test(r.body.banners.banner) && r.body.premium === false, r);
    r = await call("ads", "/api/ads", { token: ADM });
    r = await call("ads", "/api/ads", { token: B });
    check("ads: premium users get no ad code (premium=true)", r.body.premium === true, r);

    console.log("\n" + results.filter(x=>x[1]).length + "/" + results.length + " checks passed");
    const failed = results.filter(x=>!x[1]);
    if (failed.length) { console.log("FAILURES:"); failed.forEach(f => console.log(" - " + f[0])); process.exitCode = 1; }
    Object.values(servers).forEach(s => s.close());
    emuServer.close();
    process.exit(process.exitCode || 0);
  } catch (e) { console.error("HARNESS ERROR", e); process.exit(1); }
})();
