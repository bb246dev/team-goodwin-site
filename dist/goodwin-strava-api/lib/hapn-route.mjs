import { publicHapnRvStatus } from "./hapn-tracking-core.mjs";

export const HAPN_PUBLIC_PATH = "/api/strava/public/tracking-status";
const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=30";
const PUBLIC_HEADERS = {
  "Cache-Control": PUBLIC_CACHE_CONTROL,
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...PUBLIC_HEADERS, ...headers } });
}

export function createHapnPublicRateLimiter({ limit = 60, windowMs = 60_000, maxClients = 2_048, now = Date.now } = {}) {
  const clients = new Map();
  return {
    allow(clientKey = "unknown") {
      const current = Number(now());
      const previous = clients.get(clientKey);
      if (!previous || current - previous.startedAt >= windowMs) {
        if (!previous && clients.size >= maxClients) clients.delete(clients.keys().next().value);
        clients.set(clientKey, { startedAt: current, count: 1 });
        return true;
      }
      previous.count += 1;
      return previous.count <= limit;
    },
  };
}

export async function handleHapnPublicRequest(request, env, {
  fetchImpl = fetch,
  now = () => new Date(),
  rateLimiter,
  clientAddress = "unknown",
} = {}) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  if (rateLimiter && !rateLimiter.allow(clientAddress)) {
    return json({ error: "rate_limited" }, 429, { "Cache-Control": "no-store", "Retry-After": "60" });
  }
  try {
    const status = await publicHapnRvStatus({ env, fetchImpl, now: now() });
    return json(status);
  } catch {
    return json({ available: false }, 200);
  }
}
