(async () => {
  if (!(await PC.requireAuth())) return;
  let me;
  try { me = await PC.me(); } catch(e){ toast(e.message, "err"); return; }
  document.getElementById("planV").innerHTML = me.plan === "premium" ? '<span class="g">Premium</span>' : "Free";
  document.getElementById("whoV").textContent = me.email;
  const max = me.plan === "premium" ? 100 : 2;
  document.getElementById("crV").textContent = me.credits;
  document.getElementById("crBar").style.width = Math.max(0, Math.min(100, me.credits / max * 100)) + "%";
  document.getElementById("crSub").textContent = me.plan === "premium"
    ? "Renews to 100 monthly" : "2 new credits every day";
  document.getElementById("planSub").textContent = me.plan === "premium" && me.premium_until
    ? "Active until " + new Date(me.premium_until).toLocaleDateString() : "Upgrade anytime from ₦5,000";
  try {
    const h = await PC.api("/api/history");
    const grid = document.getElementById("histGrid");
    const items = (h.edits || []).filter(e => e.output_url).slice(0, 8);
    if (!items.length) document.getElementById("histEmpty").classList.remove("hidden");
    grid.innerHTML = items.map(e =>
      '<a class="edcard" href="/editor.html?open=' + encodeURIComponent(e.output_url) + '"><img loading="lazy" src="' + e.output_url + '" alt="AI edit"><div class="m"><span>' + e.kind.replace(/_/g," ") + '</span><span>' + new Date(e.created_at).toLocaleDateString() + '</span></div></a>').join("");
  } catch(e){}
})();
