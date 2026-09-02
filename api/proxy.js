export default async function handler(req, res) {
  // CORS Headers: Allows Google Apps Script to fetch CSS/JS assets safely
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const secretBackend = (process.env.MY_SECRET_BACKEND || '').replace(/\/$/, '');
  const assetPath = req.query.assetPath;
  let userQuery = req.query.q;

  // Handles direct backend static assets if requested
  if (assetPath && secretBackend) {
    const assetUrl = `${secretBackend}${assetPath}`;
    try {
      const response = await fetch(assetUrl);
      const contentType = response.headers.get("content-type") || "text/plain";
      const buffer = await response.arrayBuffer();
      
      res.setHeader("Content-Type", contentType);
      return res.status(200).send(Buffer.from(buffer));
    } catch (e) {
      return res.status(500).send("Asset fetch failed.");
    }
  }

  // Handles website/search request proxying
  if (!userQuery) return res.status(400).send("Missing target URL.");
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const response = await fetch(userQuery, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const contentType = response.headers.get("content-type") || "text/html";
    let body = await response.text();

    res.setHeader("Content-Type", contentType);
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy error: " + err.message);
  }
}
