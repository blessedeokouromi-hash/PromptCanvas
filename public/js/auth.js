// Sign-in / sign-up against Supabase (public anon key from supabase-config.json)
let CFG = null;
async function loadCfg(){
  if (CFG) return CFG;
  const r = await fetch("/supabase-config.json"); CFG = await r.json();
  window.__sbKey = CFG.key;
  return CFG;
}
function showTab(t){
  const login = t==="login";
  document.getElementById("tLogin").classList.toggle("on", login);
  document.getElementById("tSignup").classList.toggle("on", !login);
  document.getElementById("loginPane").classList.toggle("hidden", !login);
  document.getElementById("signupPane").classList.toggle("hidden", login);
}
async function supa(path, body){
  const cfg = await loadCfg();
  const r = await fetch(cfg.url + path, {
    method: body ? "POST" : "GET",
    headers: { "apikey": cfg.key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.error || ("HTTP " + r.status));
  return j;
}
async function ensureProfile(){
  // The DB trigger creates the profile; touch /api/me once to make sure + apply daily reset.
  try { await PC.api("/api/me"); } catch(e){}
}
document.getElementById("btnSignup").onclick = async () => {
  const email = document.getElementById("suEmail").value.trim(), pass = document.getElementById("suPass").value;
  const msg = document.getElementById("authMsg"); msg.textContent = "Creating account…"; msg.style.color = "";
  if (!email || pass.length < 6) { msg.textContent = "Enter an email and a password of at least 6 characters."; return; }
  try {
    const j = await supa("/auth/v1/signup", { email, password: pass });
    if (j.access_token) {
      PC.save(j); await ensureProfile(); location.href = "/app.html"; return;
    }
    // Email confirmation required
    msg.textContent = "Account created! Check your inbox for a confirmation link, then sign in here.";
    msg.style.color = "#34d399"; showTab("login");
  } catch(e){ msg.textContent = e.message; }
};
document.getElementById("btnLogin").onclick = async () => {
  const email = document.getElementById("liEmail").value.trim(), pass = document.getElementById("liPass").value;
  const msg = document.getElementById("authMsg"); msg.textContent = "Signing in…"; msg.style.color = "";
  try {
    const j = await supa("/auth/v1/token?grant_type=password", { email, password: pass });
    PC.save(j); await ensureProfile(); location.href = "/app.html";
  } catch(e){ msg.textContent = "Sign-in failed: " + e.message; }
};
async function resetPass(){
  const email = document.getElementById("liEmail").value.trim();
  if (!email) { document.getElementById("authMsg").textContent = "Type your email first, then press forgot password."; return; }
  const cfg = await loadCfg();
  await fetch(cfg.url + "/auth/v1/recover", { method:"POST", headers:{apikey:cfg.key,"Content-Type":"application/json"}, body: JSON.stringify({ email }) });
  document.getElementById("authMsg").textContent = "Password reset email sent if the account exists.";
}
// Already signed in? Straight to the dashboard.
(async () => { if (PC.token) { try { await PC.api("/api/me"); location.href = "/app.html"; } catch(e){} } })();
