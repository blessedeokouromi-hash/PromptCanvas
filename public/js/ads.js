// Loads Adsterra placements for FREE users only. Premium never sees ads.
(async () => {
  try {
    const r = await fetch("/api/ads", PC.token ? { headers:{ Authorization:"Bearer "+PC.token } } : {});
    const j = await r.json();
    if (j.premium || !j.banners) return;
    const slot = document.getElementById("adBanner");
    if (slot && j.banners.banner && slot.childElementCount === 0) {
      const label = document.createElement("div"); label.className = "adlabel"; label.textContent = "Advertisement";
      const box = document.createElement("div"); box.id = "pc-banner";
      slot.appendChild(label); slot.appendChild(box);
      inject(box, j.banners.banner);
    }
    if (j.banners.socialbar) injectAtEnd(j.banners.socialbar);
    if (j.banners.popunder) injectAtEnd(j.banners.popunder);
  } catch(e){}
})();
function inject(host, code){
  host.innerHTML = "";
  const s = document.createElement("script"); s.text = code; document.body.appendChild(s);
}
function injectAtEnd(code){
  const s = document.createElement("script"); s.text = code; document.body.appendChild(s);
}
