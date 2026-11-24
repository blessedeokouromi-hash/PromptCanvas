(async () => {
  if (!PC.token) return;
  try { await PC.api("/api/me");
    document.getElementById("navDash").style.display = "";
    document.getElementById("navTry").style.display = "";
    const cta = document.getElementById("ctaStart"); cta.textContent = "Open your studio"; cta.href = "/editor.html";
    document.getElementById("navAuth").textContent = "Account";
    document.getElementById("navAuth").onclick = ()=>location.href="/account.html";
  } catch(e){}
})();
