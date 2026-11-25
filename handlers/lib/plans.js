// Plan and pricing truth. Amounts are in kobo (NGN minor units).
// The server is the ONLY place prices come from; clients never send amounts.
module.exports = {
  FREE_DAILY_CREDITS: 2,
  PREMIUM_CREDITS: 100,
  PLANS: {
    monthly: { amount: 500000, label: "Premium Monthly", naira: "₦5,000", months: 1 },
    yearly:  { amount: 40000000, label: "Premium Yearly",  naira: "₦40,000", months: 12 }
  }
};
