/* Offline support: network first (always revalidating own files), cache as fallback. */
const CACHE = "budget-tracker-v2";
const SHELL = [
  "./", "./index.html", "./css/app.css", "./manifest.webmanifest", "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png",
  "./js/main.js", "./js/store.js", "./js/sync.js", "./js/capture.js", "./js/parser.js", "./js/categories.js", "./js/budget.js",
  "./js/format.js", "./js/icons.js", "./js/ui.js", "./js/statement.js",
  "./js/views/common.js", "./js/views/home.js", "./js/views/activity.js", "./js/views/add.js", "./js/views/budget.js",
  "./js/views/invest.js", "./js/views/settings.js", "./js/views/setup.js", "./js/views/sheets.js",
  "./js/views/quick.js", "./js/views/paste.js", "./js/views/importer.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache database calls.
  if (url.hostname.endsWith(".supabase.co") || url.pathname.includes("/rest/v1/")) return;
  const same = url.origin === self.location.origin;
  const live = same ? fetch(req.url, { cache: "no-cache" }) : fetch(req);
  e.respondWith(
    live.then((res) => {
      if (res && (res.ok || res.type === "opaque")) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
  );
});
