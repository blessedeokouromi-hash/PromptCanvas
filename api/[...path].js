// PromptCanvas AI - single catch-all serverless function.
// Vercel's Hobby plan allows at most 12 serverless functions per deployment;
// the whole backend therefore lives in this one function, which routes
// internally to the real handlers in /handlers. Behaviour is unchanged.
const routes = {
  "me": require("../handlers/me.js"),
  "upload": require("../handlers/upload.js"),
  "edit": require("../handlers/edit.js"),
  "edit-status": require("../handlers/edit-status.js"),
  "history": require("../handlers/history.js"),
  "ads": require("../handlers/ads.js"),
  "payments/init": require("../handlers/payments/init.js"),
  "payments/verify": require("../handlers/payments/verify.js"),
  "payments/activate": require("../handlers/payments/activate.js"),
  "payments/history": require("../handlers/payments/history.js"),
  "payments/webhook-paystack": require("../handlers/payments/webhook-paystack.js"),
  "payments/webhook-flutterwave": require("../handlers/payments/webhook-flutterwave.js"),
  "admin/users": require("../handlers/admin/users.js"),
  "admin/credits": require("../handlers/admin/credits.js"),
  "admin/subscription": require("../handlers/admin/subscription.js"),
  "admin/transactions": require("../handlers/admin/transactions.js"),
  "admin/stats": require("../handlers/admin/stats.js"),
  "admin/ads": require("../handlers/admin/ads.js"),
  "cron/renew": require("../handlers/cron/renew.js"),
};

module.exports = async (req, res) => {
  const path = String(req.url || "/")
    .replace(/^\/api\/?/, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/+$/, "");
  const handler = routes[path];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Unknown endpoint: /api/" + path }));
  }
  try {
    await handler(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.message || "Server error" }));
  }
};
