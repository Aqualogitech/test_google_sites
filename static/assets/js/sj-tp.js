(() => {
  const BAREMUX_PATH = "/baremux/";
  const TRANSPORTS = {
    epoxy: "/epoxy/index.mjs",
    libcurl: "/libcurl/index.mjs",
  };

  if (window.__isSjTpReady) {
    return;
  }

  window.__isSjTpReady = true;

  const sjConfig = {
    prefix: "/uv/scramjet/",
    codec: {
      encode: url => url && encodeURIComponent(url),
      decode: url => url && decodeURIComponent(url),
    },
    files: {
      wasm: "/assets/scramjet/scramjet.wasm",
      all: "/assets/scramjet/scramjet.all.js",
      sync: "/assets/scramjet/scramjet.sync.js",
    },
    flags: {
      rewriterLogs: false,
      scramitize: false,
      cleanErrors: true,
      sourcemaps: true,
    },
  };

  function getWispUrl() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/wisp/`;
  }

  async function initSjTransport() {
    if (typeof window.$scramjetLoadController !== "function") {
      throw new Error("Sj bundle did not load.");
    }

    const [{ BareMuxConnection }, { ScramjetController }] = await Promise.all([import(`${BAREMUX_PATH}index.mjs`), Promise.resolve(window.$scramjetLoadController())]);

    const sj = new ScramjetController(sjConfig);
    await sj.init();

    const transport = localStorage.getItem("is-sj-transport") === "libcurl" ? "libcurl" : "epoxy";
    const connection = new BareMuxConnection(`${BAREMUX_PATH}worker.js`);
    await connection.setTransport(TRANSPORTS[transport], [{ wisp: getWispUrl() }]);

    window.__isSj = {
      connection,
      controller: sj,
      transports: TRANSPORTS,
      transport,
      encodeUrl: url => sj.encodeUrl(url),
      decodeUrl: url => sj.decodeUrl(url),
      pxyUrl: url => sj.encodeUrl(url),
    };
  }

  async function boot() {
    try {
      await initSjTransport();
    } catch (error) {
      console.error("Failed to initialize sj transport:", error);
    }
  }

  if (document.readyState === "loading") {
    window.__isSjReady = new Promise(resolve => {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          void boot().finally(resolve);
        },
        { once: true },
      );
    });
  } else {
    window.__isSjReady = boot();
  }
})();
