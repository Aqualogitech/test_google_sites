export default function handler(req, res) {
  // Set CORS headers so Google Sites can make requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return sample JSON data
  return res.status(200).json({
    status: 'success',
    message: 'Hello from your Vercel backend!',
    timestamp: new Date().toISOString()
  });
}
