import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const previewRoot = resolve(process.argv[2] || "/private/tmp/team-goodwin-footer-preview-a250a3c");
const port = Number(process.argv[3] || 8765);
const productionOrigin = "https://goodwingoodge.com";
const proxyPaths = new Set([
  "/strava/public/races",
  "/strava/public/race-status",
  "/strava/public/tracking-status",
]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

function sendError(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(message);
}

async function proxyProduction(request, response, url) {
  try {
    const upstream = await fetch(new URL(url.pathname + url.search, productionOrigin), {
      headers: { accept: "application/json" },
      redirect: "manual",
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": body.length,
    });
    response.end(body);
  } catch {
    sendError(response, 502, "production_api_unavailable");
  }
}

function resolveRequestPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const path = resolve(previewRoot, `.${relative}`);
  if (path !== previewRoot && !path.startsWith(`${previewRoot}${sep}`)) return null;
  return path;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://preview.invalid");
  if (proxyPaths.has(url.pathname)) {
    await proxyProduction(request, response, url);
    return;
  }

  let path = resolveRequestPath(url.pathname);
  if (!path) {
    sendError(response, 400, "invalid_path");
    return;
  }
  try {
    if (statSync(path).isDirectory()) path = resolve(path, "index.html");
    const stat = statSync(path);
    const headers = {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "content-type": contentTypes[extname(path).toLowerCase()] || "application/octet-stream",
    };
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= stat.size) {
        response.writeHead(416, { "content-range": `bytes */${stat.size}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
      });
      createReadStream(path, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { ...headers, "content-length": stat.size });
    createReadStream(path).pipe(response);
  } catch {
    sendError(response, 404, "not_found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Team Goodwin footer preview: http://127.0.0.1:${port}/`);
});
