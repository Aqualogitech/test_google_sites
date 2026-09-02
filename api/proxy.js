export default async function handler(req, res) {
  let userQuery = req.query.q || '';
  const secretBackend = process.env.MY_SECRET_BACKEND || '';
  const vercelDomain = 'https://test-google-sites.vercel.app';

  if (!userQuery && secretBackend) {
    userQuery = secretBackend;
  }

  if (!userQuery) {
    return res.status(400).send("No target URL specified.");
  }

  // Prepend protocol if missing
  if (!userQuery.startsWith('http://') && !userQuery.startsWith('https://')) {
    userQuery = `https://${userQuery}`;
  }

  try {
    const targetUrl = new URL(userQuery);
    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const contentType = response.headers.get("content-type") || "";
    let body = await response.text();

    // If returning HTML, rewrite relative URLs to absolute URLs
    if (contentType.includes("text/html")) {
      const origin = targetUrl.origin;
      
      // Rewrite root-relative links (href="/assets..." -> href="https://target.com/assets...")
      body = body.replace(/(href|src)=["']\/(?!\/)/g, `$1="${origin}/`);
      
      // Inject base tag for any remaining relative scripts/styles
      if (body.includes("<head>")) {
        body = body.replace("<head>", `<head><base href="${origin}/">`);
      }
    }

    res.setHeader("Content-Type", contentType);
    return res.status(200).send(body);
  } catch (error) {
    return res.status(500).send("Proxy error: " + error.message);
  }
}
