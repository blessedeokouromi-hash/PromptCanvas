(async () => {
  if (!(await PC.requireAuth())) return;
  let me;
  try { me = await PC.me(); } catch(e){ toast(e.message,"err"); return; }
  document.getElementById("pfEmail").value = me.email;
  const sub = document.getElementById("subBox");
  if (me.plan === "premium") {
    sub.innerHTML = '<span class="pill prem">PREMIUM ACTIVE</span><p class="sm" style="margin-top:10px">Your plan runs until <b>' + new Date(me.premium_until).toLocaleDateString() + '</b>.</p><p class="sm mut">100 credits refresh automatically every month while your plan is active.</p>';
    document.getElementById("renewNote").textContent = "Renewing keeps the same expiry extension.";
  } else {
    sub.innerHTML = '<span class="pill free">FREE PLAN</span><p class="sm" style="margin-top:10px">' + me.credits + ' credits left today. 2 new credits every day.</p>';
  }
  try {
    const h = await PC.api("/api/payments/history");
    const tb = document.querySelector("#txTable tbody");
    const rows = h.transactions || [];
    if (!rows.length) document.getElementById("txEmpty").classList.remove("hidden");
    tb.innerHTML = rows.map(t =>
      "<tr><td>" + new Date(t.created_at).toLocaleDateString() + "</td><td>" + t.plan + "</td><td>₦" + (t.amount/100).toLocaleString() + "</td><td>" + t.provider + "</td><td>" + t.status + "</td></tr>").join("");
  } catch(e){}
})();
async function changePass(){
  const pass = document.getElementById("pfPass").value;
  const msg = document.getElementById("pfMsg");
  if (pass.length < 6) { msg.textContent = "Use at least 6 characters."; return; }
  const cfg = await fetch("/supabase-config.json").then(r=>r.json());
  try {
    const r = await fetch(cfg.url + "/auth/v1/user", { method:"PUT", headers:{ apikey:cfg.key, Authorization:"Bearer "+PC.token, "Content-Type":"application/json" }, body: JSON.stringify({ password: pass }) });
    if (!r.ok) throw new Error("Update rejected ("+r.status+")");
    msg.textContent = "Password updated."; document.getElementById("pfPass").value = "";
  } catch(e){ msg.textContent = "Could not update: " + e.message; }
}
