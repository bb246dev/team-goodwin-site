
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
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/" + path;
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      if (response.status !== 404) return response;
    }
    return new Response("Not found", { status: 404 });
  }
};
