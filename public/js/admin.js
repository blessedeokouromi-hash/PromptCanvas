(async () => {
  if (!(await PC.requireAuth())) return;
  let me; try { me = await PC.me(); } catch(e){ return; }
  // /api/admin/* enforces ADMIN_EMAILS server-side; the page just renders or shows denied.
  try { const s = await PC.api("/api/admin/stats"); renderStats(s); } catch(e){
    document.getElementById("adminDenied").classList.remove("hidden");
    document.getElementById("adminBody").classList.add("hidden"); return;
  }
  loadUsers(); loadTx(); loadAds();
})();
function renderStats(s){
  document.getElementById("statGrid").innerHTML = [
    ["Users", s.users], ["Premium active", s.premium_active], ["Total AI edits", s.total_edits],
    ["Revenue ₦", Math.round(s.revenue_naira).toLocaleString()]
  ].map(([k,v]) => '<div class="stat"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join("");
}
let USERS = [];
async function loadUsers(){
  try {
    const q = document.getElementById("uq").value.trim();
    const r = await PC.api("/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""));
    USERS = r.users || [];
    document.querySelector("#uTable tbody").innerHTML = USERS.map(u =>
      "<tr><td>"+u.email+"</td><td>"+(u.plan==="premium"&&u.premium_until&&new Date(u.premium_until)>new Date()?"<span class='pill prem'>premium</span>":"free")+"</td><td>"+u.credits+"</td><td>"+(u.premium_until?new Date(u.premium_until).toLocaleDateString():"-")+"</td><td>"+new Date(u.created_at).toLocaleDateString()+"</td><td class='rowflex'>"+
      "<button class='btn sm ghost' onclick='addC(\""+u.id+"\",10)'>+10</button>"+
      "<button class='btn sm ghost' onclick='setC(\""+u.id+"\",100)'>=100</button>"+
      "<button class='btn sm ghost' onclick='grant(\""+u.id+"\",\"grant_monthly\")'>+1mo</button>"+
      "<button class='btn sm ghost' onclick='grant(\""+u.id+"\",\"revoke\")'>Revoke</button>"+
      "</td></tr>").join("");
  } catch(e){ toast(e.message, "err"); }
}
async function addC(id, n){ try { await PC.api("/api/admin/credits", {method:"POST", body:JSON.stringify({user_id:id, add:n})}); loadUsers(); toast("Credits added","ok"); } catch(e){ toast(e.message,"err"); } }
async function setC(id, n){ try { await PC.api("/api/admin/credits", {method:"POST", body:JSON.stringify({user_id:id, set:n})}); loadUsers(); toast("Credits set","ok"); } catch(e){ toast(e.message,"err"); } }
async function grant(id, action){ try { await PC.api("/api/admin/subscription", {method:"POST", body:JSON.stringify({user_id:id, action})}); loadUsers(); toast("Subscription updated","ok"); } catch(e){ toast(e.message,"err"); } }
async function loadTx(){
  try { const r = await PC.api("/api/admin/transactions");
    document.querySelector("#txTable tbody").innerHTML = (r.transactions||[]).map(t =>
      "<tr><td>"+new Date(t.created_at).toLocaleDateString()+"</td><td>"+(t.user_id||"").slice(0,8)+"</td><td>"+t.plan+"</td><td>"+(t.amount/100).toLocaleString()+"</td><td>"+t.provider+"</td><td>"+t.status+"</td><td class='sm mut'>"+t.reference+"</td></tr>").join("");
  } catch(e){}
}
async function loadAds(){
  try { const r = await PC.api("/api/admin/ads"); const a = r.ads && r.ads.banners || {};
    document.getElementById("adBanner").value = a.banner||"";
    document.getElementById("adNative").value = a.native||"";
    document.getElementById("adSocial").value = a.socialbar||"";
    document.getElementById("adPop").value = a.popunder||"";
  } catch(e){}
}
async function saveAds(){
  try { await PC.api("/api/admin/ads", { method:"POST", body: JSON.stringify({
    banner: document.getElementById("adBanner").value, native: document.getElementById("adNative").value,
    socialbar: document.getElementById("adSocial").value, popunder: document.getElementById("adPop").value }) });
    toast("Ad placements saved","ok");
  } catch(e){ toast(e.message,"err"); }
}
