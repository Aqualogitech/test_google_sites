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

  // Prepend protocol if missing
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const targetUrlObj = new URL(userQuery);
    
    const response = await fetch(targetUrlObj.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const contentType = response.headers.get("content-type") || "text/html";

    // Non-HTML files (CSS, JS, Fonts, Images): Stream directly
    if (!contentType.includes("text/html")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.status(200).send(Buffer.from(buffer));
    }

    // HTML Content: Process and rewrite asset links
    let body = await response.text();
    const origin = targetUrlObj.origin;
    const pathname = targetUrlObj.pathname;
    const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1) || '/';
    const proxyEndpoint = "https://test-google-sites.vercel.app/api/proxy?q=";

    // Remove Content-Security-Policy tags that prevent loading third-party styles
    body = body.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Helper to resolve and wrap relative URLs with the Vercel proxy
    function toProxyUrl(path) {
      if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('javascript:')) {
        return path;
      }
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return `${proxyEndpoint}${encodeURIComponent(path)}`;
      }
      if (path.startsWith('//')) {
        return `${proxyEndpoint}${encodeURIComponent('https:' + path)}`;
      }
      if (path.startsWith('/')) {
        return `${proxyEndpoint}${encodeURIComponent(origin + path)}`;
      }
      return `${proxyEndpoint}${encodeURIComponent(origin + basePath + path)}`;
    }

    // Rewrite href="..." and src="..." attributes
    body = body.replace(/(href|src)=["']([^"']+)["']/gi, (match, attr, url) => {
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // Rewrite CSS url(...) functions inside inline styles
    body = body.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => {
      return `url("${toProxyUrl(url)}")`;
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy execution failed: " + err.message);
  }
}
