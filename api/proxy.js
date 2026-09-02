export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const secretBackend = (process.env.MY_SECRET_BACKEND || '').replace(/\/$/, '');
  let userQuery = req.query.q || secretBackend;

  if (!userQuery) return res.status(400).send("Missing target URL.");
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const targetUrlObj = new URL(userQuery);
    const response = await fetch(targetUrlObj.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    const contentType = response.headers.get("content-type") || "";

    // If fetching non-HTML content (CSS, JS, images, fonts), stream it directly back
    if (!contentType.includes("text/html")) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      return res.status(200).send(Buffer.from(buffer));
    }

    // If fetching HTML, rewrite asset paths so all requests pass through the proxy
    let body = await response.text();
    const origin = targetUrlObj.origin;
    const currentPath = targetUrlObj.pathname.substring(0, targetUrlObj.pathname.lastIndexOf('/') + 1);
    const proxyBase = "https://test-google-sites.vercel.app/api/proxy?q=";

    // Rewrite root-relative assets (href="/css/style.css")
    body = body.replace(/(href|src)=["']\/(?!\/)([^"']*)["']/g, (match, p1, p2) => {
      const absoluteUrl = `${origin}/${p2}`;
      return `${p1}="${proxyBase}${encodeURIComponent(absoluteUrl)}"`;
    });

    // Rewrite relative assets (href="style.css" or href="./style.css")
    body = body.replace(/(href|src)=["'](?!\/|http|https|data:)([^"']*)["']/g, (match, p1, p2) => {
      const cleanPath = p2.replace(/^\.\//, '');
      const absoluteUrl = `${origin}${currentPath}${cleanPath}`;
      return `${p1}="${proxyBase}${encodeURIComponent(absoluteUrl)}"`;
    });

    res.setHeader("Content-Type", contentType);
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy error: " + err.message);
  }
}
