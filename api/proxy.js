export default async function handler(req, res) {
  // Allow iframe embedding and cross-origin resource requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

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
    const origin = targetUrlObj.origin;
    const pathname = targetUrlObj.pathname;
    const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1) || '/';
    const proxyEndpoint = "https://test-google-sites.vercel.app/api/proxy?q=";

    const response = await fetch(targetUrlObj.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    const contentType = response.headers.get("content-type") || "";

    // Converts relative or root URLs into absolute proxied routes
    function toProxyUrl(path) {
      if (!path || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('javascript:')) return path;
      if (path.startsWith(proxyEndpoint)) return path;

      let absolute = path;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        absolute = path;
      } else if (path.startsWith('//')) {
        absolute = 'https:' + path;
      } else if (path.startsWith('/')) {
        absolute = origin + path;
      } else {
        absolute = origin + basePath + path;
      }
      return `${proxyEndpoint}${encodeURIComponent(absolute)}`;
    }

    // Process CSS files (rewrite internal url() references like fonts and images)
    if (contentType.includes("text/css")) {
      let css = await response.text();
      css = css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => `url("${toProxyUrl(url)}")`);
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      return res.status(200).send(css);
    }

    // Process Static Assets (Images, Fonts, JavaScript files)
    if (!contentType.includes("text/html")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      return res.status(200).send(Buffer.from(buffer));
    }

    // Process HTML
    let body = await response.text();

    // Remove original base tags and Content-Security-Policy headers
    body = body.replace(/<base[^>]*>/gi, '');
    body = body.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Rewrite all link/script/image/form attributes to proxy URLs
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => `${attr}="${toProxyUrl(url)}"`);

    // Rewrite inline CSS url(...) rules inside <style> tags or style attributes
    body = body.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => `url("${toProxyUrl(url)}")`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy execution failed: " + err.message);
  }
}
