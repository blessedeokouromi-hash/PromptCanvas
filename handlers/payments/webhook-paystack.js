// POST /api/payments/webhook-paystack
// Paystack calls this after a charge. Signature = HMAC-SHA512(rawBody, secret).
const crypto = require("crypto");
const { json, readBody } = require("../lib/util");
const { activate } = require("./activate");

module.exports = async (req, res) => {
  try {
    const raw = (await readBody(req, 2)).toString("utf8");
    const sig = req.headers["x-paystack-signature"] || "";
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) return json(res, 503, { error: "not configured" });
    const expected = crypto.createHmac("sha512", key).update(raw).digest("hex");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (!sig || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(res, 401, { error: "Bad signature" });
    }
    const event = JSON.parse(raw);
    if (event.event === "charge.success" && event.data && event.data.status === "success") {
      const result = await activate(event.data.reference, "paystack", { gateway_response: event.data.gateway_response });
      return json(res, 200, { received: true, activated: result.activated, already: result.already });
    }
    json(res, 200, { received: true, ignored: true });
  } catch (e) { json(res, 500, { error: e.message }); }
};
