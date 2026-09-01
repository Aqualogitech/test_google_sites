module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`
    <div style="font-family: sans-serif; padding: 10px;">
      <h3>Content Loaded from Vercel Backend</h3>
      <p>This is rendered dynamically without exposing source URLs.</p>
    </div>
  `);
};
