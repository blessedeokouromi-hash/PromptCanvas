// PromptCanvas AI service worker: app installability + light offline shell
const CACHE = "pc-shell-v1";
const PRECACHE = ["/","/css/style.css","/js/api.js","/assets/logo.svg","/assets/icon-192.png","/assets/icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/supabase")) return; // never cache API or auth
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(url.pathname).then(r => r || caches.match("/"))));
    return;
  }
  if (/\.(css|js|svg|png|jpg|webp|ico)$/.test(url.pathname)) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return res;
    }).catch(() => caches.match(e.request)));
  }
});
