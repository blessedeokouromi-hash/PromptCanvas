// PromptCanvas AI - shared client helpers (auth session + API calls)
const PC = {
  get token(){ try { return JSON.parse(localStorage.getItem("pc_session")||"null")?.access_token || null; } catch(e){ return null; } },
  get email(){ try { return JSON.parse(localStorage.getItem("pc_session")||"null")?.user?.email || null; } catch(e){ return null; } },
  save(s){ localStorage.setItem("pc_session", JSON.stringify(s)); },
  clear(){ localStorage.removeItem("pc_session"); },
  async api(path, opts){
    opts = opts || {};
    const headers = Object.assign({"Content-Type":"application/json"}, opts.headers||{});
    if (PC.token) headers["Authorization"] = "Bearer " + PC.token;
    const r = await fetch(path, Object.assign({}, opts, { headers }));
    let j = null; try { j = await r.json(); } catch(e){}
    if (!r.ok) throw new Error((j && j.error) || ("Request failed ("+r.status+")"));
    return j;
  },
  async requireAuth(){ if (!PC.token) { location.href = "/auth.html"; return false; } return true; },
  async me(){ return PC.api("/api/me"); }
};
function signOut(){
  const t = PC.token;
  if (t) { fetch("https://"+location.host+"/auth/v1/logout", {method:"POST", headers:{apikey:window.__sbKey||"", Authorization:"Bearer "+t}}).catch(()=>{}); }
  PC.clear(); location.href = "/";
}
function toast(msg, kind){
  const box = document.getElementById("toasts"); if (!box) { alert(msg); return; }
  const el = document.createElement("div");
  el.className = "toast " + (kind||"info"); el.textContent = msg;
  box.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .4s"; setTimeout(()=>el.remove(), 400); }, kind==="err"?6000:3500);
}
