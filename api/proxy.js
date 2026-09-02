export default async function handler(req, res) {
  const secretBackend = (process.env.MY_SECRET_BACKEND || '').replace(/\/$/, '');
  const assetPath = req.query.assetPath;
  let userQuery = req.query.q;

  // Handle direct static asset requests from the backend
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

  // Handle search or page proxying
  if (!userQuery) return res.status(400).send("Missing target URL.");
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const response = await fetch(userQuery, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const contentType = response.headers.get("content-type") || "text/html";
    let body = await response.text();

    res.setHeader("Content-Type", contentType);
    return res.status(200).send(body);
  } catch (err) {
    return res.status(500).send("Proxy error: " + err.message);
  }
}
