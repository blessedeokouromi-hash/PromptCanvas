// PromptCanvas editor: upload -> preview -> AI action -> result -> history
const TOOLS = [
  { id:"prompt_edit",   icon:"✍️", name:"Prompt edit",   hint:"Describe the change you want.", prompt:true,  input:true },
  { id:"bg_replace",    icon:"🌆", name:"Background swap", hint:"Describe the NEW background.", prompt:true, input:true },
  { id:"bg_generate",   icon:"🎨", name:"New background", hint:"Describe the background to generate.", prompt:true, input:false },
  { id:"portrait",      icon:"🧑‍🎤", name:"Portrait edit", hint:"Optional: describe the look.", prompt:true, input:true },
  { id:"img2img",       icon:"🔁", name:"Image to image", hint:"Describe the style or transformation.", prompt:true, input:true },
  { id:"bg_remove",     icon:"🪄", name:"Remove BG",     hint:"Cuts the subject out (needs remove.bg key).", prompt:false, input:true },
  { id:"upscale",       icon:"💎", name:"Upscale 2x",    hint:"Sharper, bigger photo (needs Replicate key).", prompt:false, input:true },
  { id:"object_remove", icon:"🧽", name:"Remove object", hint:"Brush over the object, then apply (needs Replicate key).", prompt:false, input:true, mask:true }
];
let tool = "prompt_edit", curInput = null, curMask = null, history = [];

function renderTools(){
  const rail = document.getElementById("toolrail");
  rail.innerHTML = TOOLS.map(t =>
    '<button class="tool ' + (t.id===tool?"on":"") + '" onclick="pickTool(\'' + t.id + '\')"><span class="ticon">' + t.icon + '</span>' + t.name + (t.keyreq?'<span class="req" title="needs an API key"></span>':'') + '</button>').join("");
  const t = TOOLS.find(x=>x.id===tool);
  document.getElementById("promptLabel").textContent = t.id==="bg_generate" ? "Describe the background" : "Describe your edit";
  document.getElementById("prompt").parentElement.style.display = t.prompt ? "" : "none";
  document.getElementById("toolHint").textContent = t.hint || "";
  document.getElementById("runBtn").textContent = t.id==="bg_generate" ? "Generate background" : "Apply AI edit";
  document.getElementById("maskHud").classList.toggle("hidden", !t.mask || !curInput);
}
function pickTool(id){ tool = id; renderTools(); syncMaskCanvas(); }
function setImage(url){ curInput = url; document.getElementById("drop").classList.add("hidden");
  const stage = document.getElementById("result"); stage.classList.remove("hidden");
  stage.innerHTML = '<div class="imgstage"><img id="curImg" src="'+url+'" alt="Working image"></div><div class="compare"><a class="btn sm ghost" id="dlBtn" download="promptcanvas.png" href="'+url+'">Download</a><button class="btn sm ghost" onclick="resetCanvas()">Change photo</button></div>';
  renderTools(); syncMaskCanvas();
}
function resetCanvas(){ curInput = null; curMask = null; document.getElementById("result").classList.add("hidden");
  const d = document.getElementById("drop"); d.classList.remove("hidden"); syncMaskCanvas(); renderTools(); }
async function loadHistory(){
  try { const h = await PC.api("/api/history"); history = (h.edits||[]).filter(e=>e.output_url);
    const list = document.getElementById("histList");
    list.innerHTML = history.slice(0,20).map(e =>
      '<a class="edcard" onclick="setImage(\''+e.output_url+'\');return false" href="javascript:void 0"><img loading="lazy" src="'+e.output_url+'" alt=""><div class="m"><span>'+e.kind.replace(/_/g," ")+'</span></div></a>').join("");
  } catch(e){}
}
async function refreshCredits(){
  try { const me = await PC.me();
    document.getElementById("crV").textContent = me.credits;
    document.getElementById("crSub").textContent = me.plan==="premium" ? "of 100 this month" : "of 2 today";
  } catch(e){}
}
async function runEdit(){
  if (!(await PC.requireAuth())) return;
  const t = TOOLS.find(x=>x.id===tool);
  if (t.input && !curInput) { toast("Upload a photo first (except New background).", "err"); return; }
  if (t.mask && !curMask) { toast("Brush over the object you want removed first.", "err"); return; }
  const btn = document.getElementById("runBtn"); btn.disabled = true;
  document.getElementById("working").classList.remove("hidden");
  document.getElementById("workMsg").textContent = "Working with the AI… this can take up to a minute";
  try {
    const body = { kind: tool, prompt: document.getElementById("prompt").value.trim(),
      input_path: curInput ? pathFromUrl(curInput) : null };
    if (t.mask && curMask) body.mask_path = await uploadMask();
    const r = await PC.api("/api/edit", { method:"POST", body: JSON.stringify(body) });
    setImage(r.url); loadHistory(); refreshCredits();
    toast(r.provider ? "Done with " + r.provider : "Done", "ok");
  } catch(e){
    toast(e.message.includes("No credits left") ? "No credits left. " + e.message : e.message, "err");
    refreshCredits();
  } finally {
    btn.disabled = false; document.getElementById("working").classList.add("hidden");
  }
}
function pathFromUrl(url){ const i = url.indexOf("/object/public/canvas/"); return i>=0 ? url.slice(i + "/object/public/canvas/".length) : null; }
// ---- upload flow: read file, downscale on canvas, base64 -> /api/upload ----
async function handleFile(file){
  if (!file || !file.type.startsWith("image/")) { toast("That's not an image", "err"); return; }
  if (file.size > 12*1024*1024) { toast("Too large; keep it under 12 MB", "err"); return; }
  toast("Optimizing and uploading…");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600, scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width*scale); c.height = Math.round(bitmap.height*scale);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  const r = await PC.api("/api/upload", { method:"POST", body: JSON.stringify({ dataUrl }) });
  setImage(r.url); refreshCredits();
}
// ---- object-removal mask painting ----
function syncMaskCanvas(){
  const hud = document.getElementById("maskHud"), cv = document.getElementById("maskCanvas");
  const t = TOOLS.find(x=>x.id===tool);
  const img = document.getElementById("curImg");
  if (!t || !t.mask || !img || !img.complete || !img.naturalWidth) { cv.classList.add("hidden"); return; }
  cv.classList.remove("hidden");
  const box = img.getBoundingClientRect();
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.style.width = box.width+"px"; cv.style.height = box.height+"px";
  cv.style.left = img.offsetLeft+"px"; cv.style.top = img.offsetTop+"px";
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "rgba(217,70,239,.45)";
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); draw(e); cv.onpointermove = draw; };
  cv.onpointerup = cv.onpointercancel = () => { cv.onpointermove = null; finishMask(img); };
  function draw(e){ const rect = cv.getBoundingClientRect();
    const x = (e.clientX-rect.left) * cv.width/rect.width, y = (e.clientY-rect.top) * cv.height/rect.height;
    ctx.beginPath(); ctx.arc(x, y, cv.width*0.03, 0, 7); ctx.fill(); curMask = true; }
}
function finishMask(img){ /* snapshot stored on upload via toDataURL below */ }
function clearMask(){ const cv = document.getElementById("maskCanvas"); cv.getContext("2d").clearRect(0,0,cv.width,cv.height); curMask = null; }
function undoMask(){ clearMask(); }
async function uploadMask(){
  const img = document.getElementById("curImg"), cv = document.getElementById("maskCanvas");
  // Build a black/white mask PNG at the image's size (white = remove)
  const m = document.createElement("canvas"); m.width = cv.width; m.height = cv.height;
  const ctx = m.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0,0,m.width,m.height);
  const src = cv.getContext("2d").getImageData(0,0,cv.width,cv.height);
  const out = ctx.getImageData(0,0,m.width,m.height);
  for (let i=0;i<src.data.length;i+=4){ if (src.data[i+3] > 20) { out.data[i]=255; out.data[i+1]=255; out.data[i+2]=255; out.data[i+3]=255; } }
  ctx.putImageData(out,0,0);
  const dataUrl = m.toDataURL("image/png");
  const r = await PC.api("/api/upload", { method:"POST", body: JSON.stringify({ dataUrl }) });
  return r.path;
}
// wiring
const drop = document.getElementById("drop");
drop.onclick = () => document.getElementById("file").click();
document.getElementById("file").onchange = e => handleFile(e.target.files[0]);
["dragover","dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));
window.addEventListener("resize", () => syncMaskCanvas());
renderTools(); loadHistory(); refreshCredits();
// deep link: open a history image directly
const openUrl = new URLSearchParams(location.search).get("open");
if (openUrl && /^https:\/\//.test(openUrl)) setImage(openUrl);
