export default async function handler(req, res) {
  const secretBackend = process.env.MY_SECRET_BACKEND;
  let userQuery = req.query.q || '';

  if (!userQuery) {
    return res.status(400).send("No search query provided.");
  }

  // Prepend https:// if the user typed a domain name without a protocol
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    if (userQuery.includes('.')) {
      userQuery = `https://${userQuery}`;
    }
  }

  // Determine final fetch destination
  const targetUrl = secretBackend 
    ? `${secretBackend.replace(/\/$/, '')}?q=${encodeURIComponent(userQuery)}`
    : userQuery;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Backend returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    const data = await response.text();

    res.setHeader("Content-Type", contentType || "text/html");
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).send("Proxy Request Failed: " + error.message);
  }
}
