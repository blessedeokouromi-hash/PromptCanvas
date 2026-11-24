// POST /api/payments/verify  { token, reference }
// Server-to-server check with the payment provider. A browser redirect alone
// NEVER activates Premium: this endpoint re-checks the money actually arrived.
const { cors, bearer, json, readJson } = require("../lib/util");
const { who, adminRest } = require("../lib/supa");
const { activate } = require("./activate");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const user = await who(bearer(req), req.headers.host);
    if (!user) return json(res, 401, { error: "Not signed in" });
    const { reference } = await readJson(req, 1);
    if (!reference || typeof reference !== "string") return json(res, 400, { error: "Missing payment reference" });

    const rows = await adminRest("GET", "/rest/v1/transactions?reference=eq." + encodeURIComponent(reference) + "&select=*");
    const tx = rows && rows[0];
    if (!tx || tx.user_id !== user.id) return json(res, 404, { error: "Payment not found" });
    if (tx.status === "success") return json(res, 200, { activated: true, already: true, message: "Already active" });

    let paid = false, providerData = null, message = "Payment not confirmed yet";
    if (tx.provider === "paystack") {
      const key = process.env.PAYSTACK_SECRET_KEY;
      if (!key) return json(res, 503, { error: "Paystack is not set up yet" });
      const r = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
        headers: { Authorization: "Bearer " + key }
      });
      const j = await r.json();
      providerData = { status: j.data && j.data.status, amount: j.data && j.data.amount, currency: j.data && j.data.currency };
      paid = !!(j.status && j.data && j.data.status === "success" && j.data.amount === tx.amount && j.data.currency === "NGN");
      message = j.data && j.data.gateway_response || message;
    } else {
      const key = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!key) return json(res, 503, { error: "Flutterwave is not set up yet" });
      const r = await fetch("https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=" + encodeURIComponent(reference), {
        headers: { Authorization: "Bearer " + key }
      });
      const j = await r.json();
      const d = j.data;
      providerData = { status: d && d.status, amount: d && d.amount, currency: d && d.currency };
      paid = !!(j.status === "success" && d && d.status === "successful" && Math.round((d.amount || 0) * 100) === tx.amount && d.currency === "NGN");
      message = (d && d.status) || message;
    }
    if (!paid) {
      await adminRest("PATCH", "/rest/v1/transactions?reference=eq." + encodeURIComponent(reference), { status: "failed", provider_data: providerData });
      return json(res, 200, { activated: false, message: "Payment not confirmed: " + message });
    }
    const result = await activate(reference, tx.provider, providerData);
    json(res, 200, result);
  } catch (e) { json(res, 500, { error: e.message }); }
};
