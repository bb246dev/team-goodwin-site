
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
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/.asset-debug") {
      const probes = [
        "/",
        "/index.html",
        "/live-tracking.html",
        "/live-tracking/index.html",
        "/dist/index.html",
        "/dist/live-tracking.html",
        "/dist/live-tracking/index.html",
        "/assets/styles-ulvf0Dcj.css",
        "/dist/assets/styles-ulvf0Dcj.css"
      ];
      const results = [];
      for (const probe of probes) {
        const response = await env.ASSETS.fetch(new Request(new URL(probe, request.url)));
        results.push({ probe, status: response.status, type: response.headers.get("content-type") });
      }
      return Response.json(results);
    }

    for (const path of candidates(request.url)) {
      for (const prefix of ["", "/dist"]) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = prefix + "/" + path;
        const response = await env.ASSETS.fetch(new Request(assetUrl, request));
        if (response.status !== 404) return response;
      }
    }
    return new Response("Not found", { status: 404 });
  }
};
