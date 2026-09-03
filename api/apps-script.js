import fetch from "node-fetch";

const APPS_SCRIPT_ENV_VAR = "APPS_SCRIPT_URL";

function getTargetUrl(query) {
  const configuredUrl = process.env[APPS_SCRIPT_ENV_VAR];
  if (!configuredUrl) {
    throw new Error(`${APPS_SCRIPT_ENV_VAR} is not configured`);
  }

  const targetUrl = new URL(configuredUrl);
  if (targetUrl.protocol !== "https:") {
    throw new Error(`${APPS_SCRIPT_ENV_VAR} must use HTTPS`);
  }

  if (query) targetUrl.searchParams.set("q", query);
  return targetUrl;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length > 2000) {
    return res.status(400).send("Query is too long");
  }

  try {
    const response = await fetch(getTargetUrl(query), {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Interstellar/5.2.5",
      },
    });

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");

    const body = Buffer.from(await response.arrayBuffer());
    return res.status(response.status).send(body);
  } catch (error) {
    return res.status(502).send(`Apps Script request failed: ${error.message}`);
  }
}
