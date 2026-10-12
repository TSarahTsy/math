/* =========================================================
   恩慈數字遊戲 Service Worker
   ---------------------------------------------------------
   ・更新任何遊戲後，請把 VERSION 加一（例如 v1 → v2），
     學生的 iPad／電腦下次連線時便會取得新版本。
   ・新增遊戲時，把它的路徑加入 PRECACHE。
   ========================================================= */
const VERSION = "v3";
const PREFIX = "rcgs-numbers-";
const CACHE = PREFIX + VERSION;

// 安裝時預先下載的檔案（路徑相對於 sw.js 所在位置）
// 個別檔案下載失敗不會影響其他檔案
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "maths_thin_v2.ttf",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",

  // 錄音
  ...Array.from({ length: 10 }, (_, i) => `audio/${i + 1}.mp3`),

  // 遊戲
  "strokenumber-0-9/",
  "writenumber-1-20/",
  "choosenumber-11-20/",
  "buildnumber-11-20/",
  "twenty-frame_count/",
  "sequencenumber-1-20/",
  "rcgs-11-20/",
  "11-20-cantonese.html",
  // "cantonese-number-b….html",   ← 請補上完整檔名
  // "cantonese-number-g….html",   ← 請補上完整檔名
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/* ---------- 安裝：預先快取 ---------- */
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async path => {
      try {
        const res = await fetch(new Request(path, { cache: "reload" }));
        if (res.ok) await cache.put(path, res);
      } catch (e) { /* 忽略 */ }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- 啟用：刪除舊版本快取 ---------- */
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- 讀取 ---------- */
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.headers.has("range")) {
    event.respondWith(rangeResponse(req));
    return;
  }
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

// 同一頁面可能以「資料夾/」或「資料夾/index.html」開啟，兩者都嘗試
async function matchAny(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const url = new URL(req.url);
  if (url.pathname.endsWith("/")) return caches.match(url.href + "index.html", { ignoreSearch: true });
  if (url.pathname.endsWith("/index.html")) return caches.match(url.href.replace(/index\.html(\?.*)?$/, ""), { ignoreSearch: true });
  return undefined;
}

// 網頁：有網絡時取最新版本，離線或過慢時用快取
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 4000)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await matchAny(req);
    if (hit) return hit;
    return new Response("<h1 style='font-family:sans-serif;text-align:center;margin-top:20vh'>未能連線，請稍後再試</h1>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

// 錄音、字型、圖片：先用快取，沒有才下載
async function cacheFirst(req) {
  const hit = await matchAny(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}

// Google 字型：先用快取，同時在背景更新
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || update;
}

// iPad Safari 播放 <audio> 時會要求部分內容（Range），須從快取切出所需片段
async function rangeResponse(req) {
  const url = req.url;
  let full = await matchAny(new Request(url));
  if (!full) {
    try {
      full = await fetch(url);
      if (full.ok) (await caches.open(CACHE)).put(url, full.clone());
      else return fetch(req);
    } catch (e) { return new Response("", { status: 504 }); }
  }
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, buf.byteLength - parseInt(m[2], 10)); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
