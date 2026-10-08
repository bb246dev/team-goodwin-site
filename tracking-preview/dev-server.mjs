import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.TRACKING_PREVIEW_PORT || 4174);
const repositoryRoot = resolve(import.meta.dirname, "..");
const previewRoot = join(import.meta.dirname, "dist", "tracking-preview");
const cache = new Map();
const productionAssetCache = new Map();

export const GARMIN_CACHE_MS = 120_000;
export const GARMIN_STALE_MS = 600_000;
export const GARMIN_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCTION_ASSET_ORIGIN = "https://goodwingoodge.com";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".woff2", "font/woff2"],
]);

export function allowedGarminTarget(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
    const loader = url.hostname === "share.garmin.com"
      && url.pathname.toLowerCase() === "/feed/shareloader/missionamerica";
    const feed = /^[-a-z0-9]+-share\.explore\.garmin\.com$/i.test(url.hostname)
      && url.pathname.toLowerCase() === "/feed/share/missionamerica";
    const inreachIii = url.hostname === "aus-share.explore.garmin.com"
      && url.pathname.toLowerCase() === "/feed/share/missionamerica50";
    return loader || feed || inreachIii;
  } catch {
    return false;
  }
}

function send(response, status, type, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

async function fetchGarmin(target) {
  const prior = cache.get(target);
  const now = Date.now();
  if (prior && now - prior.fetchedAt < GARMIN_CACHE_MS) return { ...prior, state: "fresh" };
  try {
    const upstream = await fetch(target, {
      redirect: "manual",
      headers: {
        Accept: "application/vnd.google-earth.kml+xml, application/xml, text/xml",
        "User-Agent": "GoodwinMissionAmerica-GarminKML-LocalPreview/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
    const type = upstream.headers.get("content-type") || "";
    const length = Number(upstream.headers.get("content-length"));
    if (!upstream.ok || upstream.status >= 300
      || !/^(?:application\/(?:vnd\.google-earth\.kml\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(type)
      || (Number.isFinite(length) && length > GARMIN_MAX_BYTES)) throw new Error("invalid_garmin_response");
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > GARMIN_MAX_BYTES) throw new Error("garmin_feed_too_large");
    const entry = { body, fetchedAt: now };
    cache.set(target, entry);
    return { ...entry, state: "fresh" };
  } catch (error) {
    if (prior && now - prior.fetchedAt < GARMIN_STALE_MS) return { ...prior, state: "stale" };
    throw error;
  }
}

async function fetchMissingProductionAsset(pathname) {
  if (!pathname.startsWith("/assets/") && !pathname.startsWith("/fonts/")) return null;
  if (productionAssetCache.has(pathname)) return productionAssetCache.get(pathname);
  const upstream = await fetch(new URL(pathname, PRODUCTION_ASSET_ORIGIN), {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!upstream.ok) return null;
  const body = Buffer.from(await upstream.arrayBuffer());
  const result = {
    body,
    type: upstream.headers.get("content-type") || contentTypes.get(extname(pathname).toLowerCase()) || "application/octet-stream",
  };
  productionAssetCache.set(pathname, result);
  return result;
}

function staticTarget(pathname) {
  if (pathname === "/tracking-preview" || pathname === "/tracking-preview/") return join(previewRoot, "index.html");
  if (pathname === "/tracking-preview/embed" || pathname === "/tracking-preview/embed/") return join(previewRoot, "embed", "index.html");
  if (pathname === "/tracking-preview/inreach-iii" || pathname === "/tracking-preview/inreach-iii/") {
    return join(previewRoot, "inreach-iii", "index.html");
  }
  const roots = [
    ["/tracking-preview/", previewRoot],
    ["/assets/", join(repositoryRoot, "assets")],
    ["/fonts/", join(repositoryRoot, "fonts")],
  ];
  for (const [prefix, root] of roots) {
    if (!pathname.startsWith(prefix)) continue;
    const relative = normalize(pathname.slice(prefix.length)).replace(/^(?:\.\.(?:\/|\\|$))+/, "");
    const target = join(root, relative);
    if (target === root || !target.startsWith(`${root}/`)) return null;
    return target;
  }
  return null;
}

export function createPreviewServer() {
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "text/plain; charset=utf-8", "method_not_allowed", { Allow: "GET, HEAD" });
      return;
    }
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    if (requestUrl.pathname === "/tracking-preview/garmin-feed.php") {
      const target = requestUrl.searchParams.get("url") || "";
      if (!allowedGarminTarget(target)) {
        send(response, 400, "text/plain; charset=utf-8", "invalid_garmin_target", { "Cache-Control": "no-store" });
        return;
      }
      try {
        const result = await fetchGarmin(target);
        send(response, 200, "application/vnd.google-earth.kml+xml; charset=utf-8", request.method === "HEAD" ? "" : result.body, {
          "Cache-Control": "public, max-age=0, s-maxage=120, stale-if-error=600",
          "X-Garmin-Cache": result.state,
        });
      } catch {
        send(response, 503, "text/plain; charset=utf-8", "garmin_feed_unavailable", { "Cache-Control": "no-store" });
      }
      return;
    }
    const target = staticTarget(decodeURIComponent(requestUrl.pathname));
    if (!target) {
      send(response, 404, "text/plain; charset=utf-8", "not_found");
      return;
    }
    try {
      const body = await readFile(target);
      const type = contentTypes.get(extname(target).toLowerCase()) || "application/octet-stream";
      send(response, 200, type, request.method === "HEAD" ? "" : body, {
        "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=0",
      });
    } catch {
      try {
        const fallback = await fetchMissingProductionAsset(requestUrl.pathname);
        if (fallback) {
          send(response, 200, fallback.type, request.method === "HEAD" ? "" : fallback.body, {
            "Cache-Control": "public, max-age=300",
          });
          return;
        }
      } catch {
        // Fall through to a local 404 when the read-only production asset fallback is unavailable.
      }
      send(response, 404, "text/plain; charset=utf-8", "not_found");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const server = createPreviewServer();
  server.listen(port, host, () => {
    console.log(`Tracking preview: http://${host}:${port}/tracking-preview/`);
  });
}
