module.exports = function handler(req, res) {
  // Allow cross-origin access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle browser CORS preflight check
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const data = req.body;
    // Process form data here...
    return res.status(200).json({ status: 'success', received: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
