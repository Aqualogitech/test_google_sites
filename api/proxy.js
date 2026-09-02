export default async function handler(req, res) {
  const secretBackend = process.env.MY_SECRET_BACKEND;

  if (!secretBackend) {
    return res.status(500).json({ error: "Backend URL not configured in Vercel settings" });
  }

  try {
    // Get the search query or URL sent from index.html
    const userQuery = req.query.q || '';
    
    // Append the query to your backend URL
    const targetUrl = `${secretBackend}?q=${encodeURIComponent(userQuery)}`;

    const response = await fetch(targetUrl);
    const data = await response.json();

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to connect to backend server" });
  }
}
