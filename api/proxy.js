export default async function handler(req, res) {
  const backendUrl = process.env.BACKEND_URL;

  try {
    // Vercel's server fetches data from your backend securely
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_SECRET_KEY}`, // hidden from client
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
