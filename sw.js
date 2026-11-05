// Service worker do Juntos: guarda o app no celular para abrir sem internet.
// Os dados do banco (Supabase) nunca passam por este cache.
const VERSAO = "juntos-v1.7.0";
const APP = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const EXTERNOS = ["https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js", "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    await c.addAll(APP);
    for (const u of EXTERNOS) { try { await c.add(new Request(u, { mode: "cors" })); } catch (_) {} }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSAO) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // dados: sempre pela rede
  const mesmoSite = url.origin === self.location.origin;
  const fonte = url.hostname.includes("fonts.g") || url.hostname === "cdn.jsdelivr.net";
  if (!mesmoSite && !fonte) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSAO);
    const salvo = await c.match(req, { ignoreSearch: mesmoSite });
    const rede = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
    if (salvo) { e.waitUntil(rede); return salvo; }
    const r = await rede;
    if (r) return r;
    if (req.mode === "navigate") return (await c.match("index.html")) || Response.error();
    return Response.error();
  })());
});
