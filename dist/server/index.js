const manifest = __STATIC_CONTENT_MANIFEST;
const assets = typeof manifest === "string" ? JSON.parse(manifest) : manifest;

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

function candidates(url) {
  const { pathname } = new URL(url);
  const clean = pathname.replace(/^\/+/, "") || "index.html";
  const list = [clean];
  if (!clean.includes(".")) list.push(clean.replace(/\/$/, "") + "/index.html");
  if (!clean.endsWith(".html")) list.push(clean.replace(/\/$/, "") + ".html");
  return list;
}

export default {
  async fetch(request, env) {
    for (const path of candidates(request.url)) {
      const key = assets[path];
      if (!key) continue;
      const asset = await env.__STATIC_CONTENT.get(key, "arrayBuffer");
      if (!asset) continue;
      return new Response(asset, {
        headers: {
          "content-type": contentType(path),
          "cache-control": path.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable"
        }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
