(async () => {
  if (PC.token) { document.getElementById("soBtn").style.display = ""; }
  // Returning from checkout: server-side verify, never trust the redirect alone.
  const ref = new URLSearchParams(location.search).get("verify");
  if (ref && PC.token) {
    toast("Checking your payment with " + (ref.startsWith("PC") ? "the processor" : "the processor") + "…");
    try {
      const r = await PC.api("/api/payments/verify", { method:"POST", body: JSON.stringify({ reference: ref }) });
      if (r.activated) { toast("Premium activated! 100 credits added.", "ok"); setTimeout(()=>location.href="/app.html", 1200); return; }
      if (r.already) { toast("This payment was already applied.", "ok"); }
      else toast("Payment not confirmed yet: " + (r.message || "still processing"), "err");
    } catch(e){ toast(e.message, "err"); }
  }
})();
async function pay(plan, provider){
  if (!(await PC.requireAuth())) return;
  toast("Starting checkout…");
  try {
    const r = await PC.api("/api/payments/init", { method:"POST", body: JSON.stringify({ plan, provider }) });
    location.href = r.link;
  } catch(e){ toast(e.message, "err"); }
}
async function choose(){
  if (!(await PC.requireAuth())) return;
  location.href = "/app.html";
}
