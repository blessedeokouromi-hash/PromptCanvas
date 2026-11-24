// Static-page smoke test: every page serves and contains its key elements.
const http = require("http");
const fs = require("fs");
const path = require("path");
const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".svg":"image/svg+xml", ".json":"application/json" };
const root = path.join(__dirname, "..", "public");
const srv = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  let f = path.join(root, p);
  if (!fs.existsSync(f)) f = path.join(root, "..", p); // repo-root files (supabase-config.json) are served too
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" });
  res.end(fs.readFileSync(f));
}).listen(4499);
const pages = {
  "/index.html": ["PromptCanvas", "Start free, 2 edits daily", "₦5,000", "₦40,000"],
  "/auth.html": ["Create account", "btnLogin", "btnSignup"],
  "/app.html": ["AI credits", "histGrid", "New AI edit"],
  "/editor.html": ["toolrail", "runBtn", "Apply AI edit", "maskCanvas"],
  "/pricing.html": ["Pay with Paystack", "Pay with Flutterwave", "₦5,000", "₦40,000"],
  "/account.html": ["Payment history", "Subscription", "changePass"],
  "/admin.html": ["Ad placements", "Users", "Payments", "statGrid"],
  "/css/style.css": ["--grad", ".tool.on", "@media(max-width:560px)"],
  "/assets/logo.svg": ["<svg"],
  "/supabase-config.json": ["url", "key"]
};
(async () => {
  let pass = 0, fail = 0;
  for (const [p, needles] of Object.entries(pages)) {
    const r = await fetch("http://localhost:4499" + p);
    const t = await r.text();
    const missing = needles.filter(n => !t.includes(n));
    if (r.status === 200 && !missing.length) { pass++; console.log("PASS", p); }
    else { fail++; console.log("FAIL", p, "missing:", missing.join(", "), "status", r.status); }
  }
  console.log(pass + "/" + (pass + fail) + " pages ok");
  srv.close(); process.exit(fail ? 1 : 0);
})();
