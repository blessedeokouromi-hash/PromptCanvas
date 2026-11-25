// POST /api/payments/webhook-flutterwave
// Flutterwave sends header "verif-hash"; it must equal FLW_WEBHOOK_HASH you set.
const { json, readBody } = require("../lib/util");
const { activate } = require("./activate");

module.exports = async (req, res) => {
  try {
    const raw = (await readBody(req, 2)).toString("utf8");
    if (!process.env.FLW_WEBHOOK_HASH) return json(res, 503, { error: "not configured" });
    if (req.headers["verif-hash"] !== process.env.FLW_WEBHOOK_HASH) return json(res, 401, { error: "Bad hash" });
    const event = JSON.parse(raw);
    const d = event.data || {};
    if (event.event === "charge.completed" && d.status === "successful") {
      const result = await activate(d.tx_ref, "flutterwave", { flw_id: d.id, status: d.status });
      return json(res, 200, { received: true, activated: result.activated, already: result.already });
    }
    json(res, 200, { received: true, ignored: true });
  } catch (e) { json(res, 500, { error: e.message }); }
};
