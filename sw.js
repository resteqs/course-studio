const scope = new URL(self.registration.scope);
const CACHE_PREFIX = "delightful-learn-shell-" + scope.pathname + "-";
const CACHE = CACHE_PREFIX + "v4";
const shell = new URL("./", scope);
const appShellAssets = new Set([
  "index.html", "theme-init.js", "app-config.js", "style.css", "delight.js", "illustrations.js", "app.js", "favicon.svg",
  "vendor/codemirror.bundle.mjs", "python-runner.html", "python-runner.js",
].map((path) => new URL(path, scope).href));
const localStudio = new URL(self.location.href).searchParams.has("studio");

self.addEventListener("install", (event) => {
  // Local Studio serves its own shell and has no generated app-config.js.
  const studioOnly = new Set(["index.html", "app-config.js"].map((path) => new URL(path, scope).href));
  const precache = [...appShellAssets].filter((url) => !localStudio || !studioOnly.has(url));
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(precache))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

function isImmutableAsset(url) {
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    return /^sfx\/[\w-]+\.wav$/.test(url.pathname.slice(scope.pathname.length));
  }
  if (url.origin === "https://cdn.jsdelivr.net") {
    return url.pathname.startsWith("/npm/katex@0.16.11/dist/")
      || url.pathname === "/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js"
      || url.pathname.startsWith("/pyodide/v0.26.4/full/");
  }
  return url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin === scope.origin && url.pathname.includes("/api/")) return;

  // Authenticated Supabase reads and mutations require the network. Never store
  // account-specific responses, tokens, or curriculum in the app-shell cache.
  if (url.protocol === "https:" && url.hostname.endsWith(".supabase.co")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (request.method !== "GET") return;

  if (!localStudio && request.mode === "navigate" && url.origin === shell.origin
      && (url.pathname === shell.pathname || url.pathname === new URL("index.html", shell).pathname)) {
    // A callback can contain auth parameters, so only the precached shell is an
    // offline fallback and callback URLs are never used as cache keys.
    event.respondWith(fetch(request).catch(() => caches.match(new URL("index.html", shell))));
    return;
  }

  // Same-origin app shell assets use network-first so fresh deployments appear
  // on the very first reload in Safari/Chrome while still working offline.
  if (appShellAssets.has(url.href)) {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok) {
          const store = await caches.open(CACHE);
          await store.put(request, response.clone()).catch(() => {});
        }
        return response;
      }).catch(() => caches.open(CACHE).then((store) => store.match(request))),
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  const cache = caches.open(CACHE);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok || response.type === "opaque") {
      await cache.then((store) => store.put(request, response.clone())).catch(() => {});
    }
    return response;
  });
  event.waitUntil(refresh.catch(() => {}));
  event.respondWith(cache.then((store) => store.match(request)).catch(() => null)
    .then((cached) => cached || refresh));
});
