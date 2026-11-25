// POST /api/payments/init  { token, plan: 'monthly'|'yearly', provider: 'paystack'|'flutterwave' }
// Creates a pending transaction, then asks the provider for a checkout link.
// Amounts come ONLY from lib/plans; the client never sends an amount.
const { cors, bearer, json, readJson } = require("../lib/util");
const { who, adminRest, getProfile } = require("../lib/supa");
const { PLANS } = require("../lib/plans");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    const body = await readJson(req, 1);
    const plan = PLANS[body.plan] ? body.plan : null;
    const provider = body.provider === "flutterwave" ? "flutterwave" : body.provider === "paystack" ? "paystack" : null;
    if (!plan || !provider) return json(res, 400, { error: "Pick a plan and a payment provider" });
    const cfg = PLANS[plan];
    const origin = "https://" + req.headers.host;
    const reference = "PC-" + plan.toUpperCase().slice(0, 3) + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);

    await adminRest("POST", "/rest/v1/transactions",
      { user_id: user.id, provider, reference, plan, amount: cfg.amount, currency: "NGN", status: "pending" });

    let link = null;
    if (provider === "paystack") {
      const key = process.env.PAYSTACK_SECRET_KEY;
      if (!key) return json(res, 503, { error: "Paystack is not set up yet. Add the PAYSTACK_SECRET_KEY in the project settings." });
      const r = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email, amount: cfg.amount, currency: "NGN", reference,
          callback_url: origin + "/pricing.html?verify=" + reference,
          metadata: { plan, user_id: user.id, app: "promptcanvas" }
        })
      });
      const j = await r.json();
      if (!r.ok || !j.status) return json(res, 502, { error: "Paystack rejected the request: " + (j.message || r.status) });
      link = j.data.authorization_url;
    } else {
      const key = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!key) return json(res, 503, { error: "Flutterwave is not set up yet. Add the FLUTTERWAVE_SECRET_KEY in the project settings." });
      const r = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: reference, amount: cfg.amount / 100, currency: "NGN",
          redirect_url: origin + "/pricing.html?verify=" + reference,
          customer: { email: user.email }, customizations: { title: "PromptCanvas AI", description: cfg.label }
        })
      });
      const j = await r.json();
      if (!r.ok || j.status !== "success") return json(res, 502, { error: "Flutterwave rejected the request: " + (j.message || r.status) });
      link = j.data && j.data.link;
    }
    json(res, 200, { reference, link, plan, amount_naira: cfg.amount / 100, provider });
  } catch (e) { json(res, 500, { error: e.message }); }
};
