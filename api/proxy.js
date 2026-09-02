export default async function handler(req, res) {
  // CORS Headers: Permits the Google Apps Script iframe to fetch assets
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const secretBackend = (process.env.MY_SECRET_BACKEND || '').replace(/\/$/, '');
  let userQuery = req.query.q || secretBackend;

  if (!userQuery) {
    return res.status(400).send("Missing target URL.");
  }

  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const targetUrlObj = new URL(userQuery);
    const proxyEndpoint = "https://test-google-sites.vercel.app/api/proxy?q=";
    const origin = targetUrlObj.origin;
    const pathname = targetUrlObj.pathname;
    const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1) || '/';

    const response = await fetch(targetUrlObj.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    const contentType = response.headers.get("content-type") || "";

    // Helper to convert relative URLs to proxy URLs
    function toProxyUrl(path) {
      if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('javascript:')) return path;
      if (path.startsWith(proxyEndpoint)) return path;
      let absolute = path;
      if (path.startsWith('http://') || path.startsWith('https://')) absolute = path;
      else if (path.startsWith('//')) absolute = 'https:' + path;
      else if (path.startsWith('/')) absolute = origin + path;
      else absolute = origin + basePath + path;
      return `${proxyEndpoint}${encodeURIComponent(absolute)}`;
    }

    // CSS Processing: Rewrite relative url() assets inside stylesheet files
    if (contentType.includes("text/css")) {
      let css = await response.text();
      css = css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => `url("${toProxyUrl(url)}")`);
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      return res.status(200).send(css);
    }

    // Non-HTML/CSS Processing (JS, Images, Fonts): Stream raw data
    if (!contentType.includes("text/html")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      return res.status(200).send(Buffer.from(buffer));
    }

    // HTML Processing
    let body = await response.text();

    // Strip Security Policies blocking third-party styles
    body = body.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Inject Interceptor Script into <head> to route dynamic JS fetch/XHR calls through proxy
    const clientInterceptor = `
      <script>
        (function() {
          const PROXY = "${proxyEndpoint}";
          const ORIGIN = "${origin}";
          const BASE_PATH = "${basePath}";

          function resolveUrl(url) {
            if (!url || typeof url !== 'string') return url;
            if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith(PROXY)) return url;
            let absolute = url;
            if (url.startsWith('http://') || url.startsWith('https://')) absolute = url;
            else if (url.startsWith('//')) absolute = 'https:' + url;
            else if (url.startsWith('/')) absolute = ORIGIN + url;
            else absolute = ORIGIN + BASE_PATH + url;
            return PROXY + encodeURIComponent(absolute);
          }

          const origFetch = window.fetch;
          window.fetch = function(resource, init) {
            if (typeof resource === 'string') resource = resolveUrl(resource);
            else if (resource && resource.url) resource = new Request(resolveUrl(resource.url), resource);
            return origFetch.call(this, resource, init);
          };

          const origOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url, ...args) {
            return origOpen.call(this, method, resolveUrl(url), ...args);
          };
        })();
      </script>
    `;

    if (body.includes("<head>")) {
      body = body.replace(/<head>/i, `<head>${clientInterceptor}`);
    } else {
      body = clientInterceptor + body;
    }

    // Rewrite static HTML attributes
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => `${attr}="${toProxyUrl(url)}"`);

    // Rewrite inline styles
    body = body.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => `url("${toProxyUrl(url)}")`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy execution failed: " + err.message);
  }
}
