importScripts("/assets/history-obfuscated/config.js?v=2025-04-15");
importScripts("/assets/history-obfuscated/worker.js?v=2025-04-15");
importScripts("/assets/mathematics-obfuscated/bundle.js?v=2025-04-15");
importScripts("/assets/mathematics-obfuscated/config.js?v=2025-04-15");
importScripts(__uv$config.sw || "/assets/mathematics-obfuscated/sw.js?v=2025-04-15");
importScripts("/assets/languagearts-obfuscated/sj.all.js?v=2025-04-15");
const { ScramjetServiceWorker } = $scramjetLoadWorker();

const uv = new UVServiceWorker();
const dynamic = new Dynamic();
const sj = new ScramjetServiceWorker();

const userKey = new URL(location).searchParams.get("userkey");
self.dynamic = dynamic;

self.addEventListener("fetch", event => {
  event.respondWith(
    (async () => {
      await sj.loadConfig();

      if (await sj.route(event)) {
        return await sj.fetch(event);
      }

      if (await dynamic.route(event)) {
        return await dynamic.fetch(event);
      }

      if (event.request.url.startsWith(`${location.origin}/a/`)) {
        return await uv.fetch(event);
      }

      return await fetch(event.request);
    })(),
  );
});
