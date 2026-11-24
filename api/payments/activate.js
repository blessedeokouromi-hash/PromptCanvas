// Shared activation logic used by verify + both webhooks.
// Idempotent: a reference is activated at most once.
const { adminRest, getProfile } = require("../lib/supa");
const { PLANS, PREMIUM_CREDITS } = require("../lib/plans");

function addMonths(dateIso, n) {
  const d = new Date(dateIso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
}

async function alreadyActive(reference) {
  const rows = await adminRest("GET", "/rest/v1/transactions?reference=eq." + encodeURIComponent(reference) + "&select=status");
  return rows && rows[0] && rows[0].status === "success";
}

// Returns {activated:boolean, already:boolean, message}
async function activate(reference, provider, providerData) {
  const rows = await adminRest("GET", "/rest/v1/transactions?reference=eq." + encodeURIComponent(reference) + "&select=*");
  const tx = rows && rows[0];
  if (!tx) return { activated: false, already: false, message: "Unknown reference (transaction was never started here)" };
  if (tx.status === "success") return { activated: false, already: true, message: "Already activated" };
  if (tx.provider !== provider) return { activated: false, already: false, message: "Provider mismatch" };
  const plan = PLANS[tx.plan];
  if (!plan) return { activated: false, already: false, message: "Unknown plan on the transaction" };

  const now = new Date().toISOString();
  const until = addMonths(now, plan.months);
  // Premium = expiry tracked, 100 credits now, monthly renewal 1 month from now.
  await getProfile(tx.user_id); // ensures profile exists
  await adminRest("PATCH", "/rest/v1/profiles?id=eq." + tx.user_id, {
    plan: "premium", premium_until: until, credits: PREMIUM_CREDITS,
    next_renewal: addMonths(now, 1), last_daily_reset: now.slice(0, 10)
  });
  await adminRest("PATCH", "/rest/v1/transactions?reference=eq." + encodeURIComponent(reference),
    { status: "success", provider_data: providerData || null });
  return { activated: true, already: false, message: "Premium active until " + until, until };
}

module.exports = { activate, alreadyActive, addMonths };
