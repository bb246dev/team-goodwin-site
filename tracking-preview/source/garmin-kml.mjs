export const GARMIN_LOADER_URL = "https://share.garmin.com/Feed/ShareLoader/missionamerica";
export const GARMIN_INREACH_III_URL = "https://aus-share.explore.garmin.com/Feed/Share/missionamerica50";
export const GARMIN_PROXY_ENDPOINT = "/tracking-preview/garmin-feed.php";
export const GARMIN_MIN_REFRESH_MS = 120_000;
export const GARMIN_FRESH_MS = 10 * 60_000;
export const GARMIN_REQUEST_TIMEOUT_MS = 8_000;

const MAX_KML_BYTES = 2 * 1024 * 1024;

function decodeXml(value) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi, (match, decimal, hexadecimal, named) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' }[named.toLowerCase()];
  });
}

function parseAttributes(source) {
  const attributes = {};
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    if (cursor >= source.length) break;
    const name = source.slice(cursor).match(/^[:A-Z_a-z][:A-Z_a-z\-.0-9]*/)?.[0];
    if (!name) throw new Error("invalid_kml_xml");
    cursor += name.length;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    if (source[cursor] !== "=") throw new Error("invalid_kml_xml");
    cursor += 1;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error("invalid_kml_xml");
    const end = source.indexOf(quote, cursor + 1);
    if (end < 0) throw new Error("invalid_kml_xml");
    attributes[name] = decodeXml(source.slice(cursor + 1, end));
    cursor = end + 1;
  }
  return attributes;
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let cursor = start; cursor < xml.length; cursor += 1) {
    const character = xml[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return cursor;
  }
  return -1;
}

function parseXml(xml) {
  if (typeof xml !== "string" || !xml.trim() || new TextEncoder().encode(xml).byteLength > MAX_KML_BYTES
    || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_kml_xml");
  const document = { name: "#document", localName: "#document", attributes: {}, children: [], text: "", parent: null };
  const stack = [document];
  let cursor = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const appendText = (text) => { if (text) stack.at(-1).text += decodeXml(text); };
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      appendText(xml.slice(cursor));
      cursor = xml.length;
      break;
    }
    appendText(xml.slice(cursor, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) throw new Error("invalid_kml_xml");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) throw new Error("invalid_kml_xml");
      stack.at(-1).text += xml.slice(open + 9, end);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) throw new Error("invalid_kml_xml");
      cursor = end + 2;
      continue;
    }
    const end = findTagEnd(xml, open + 1);
    if (end < 0) throw new Error("invalid_kml_xml");
    const tag = xml.slice(open + 1, end).trim();
    if (!tag || tag.startsWith("!")) throw new Error("invalid_kml_xml");
    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      if (!/^[:A-Z_a-z][:A-Z_a-z\-.0-9]*$/.test(name) || stack.length === 1 || stack.at(-1).name !== name) {
        throw new Error("invalid_kml_xml");
      }
      stack.pop();
    } else {
      const selfClosing = tag.endsWith("/");
      const body = (selfClosing ? tag.slice(0, -1) : tag).trim();
      const name = body.match(/^[:A-Z_a-z][:A-Z_a-z\-.0-9]*/)?.[0];
      if (!name) throw new Error("invalid_kml_xml");
      const parent = stack.at(-1);
      const node = {
        name,
        localName: name.includes(":") ? name.slice(name.indexOf(":") + 1) : name,
        attributes: parseAttributes(body.slice(name.length)),
        children: [],
        text: "",
        parent,
      };
      parent.children.push(node);
      if (!selfClosing) stack.push(node);
    }
    cursor = end + 1;
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.children[0].localName !== "kml") {
    throw new Error("invalid_kml_xml");
  }
  return document.children[0];
}

function descendants(node, localName) {
  const matches = [];
  for (const child of node.children) {
    if (child.localName === localName) matches.push(child);
    matches.push(...descendants(child, localName));
  }
  return matches;
}

function firstDescendant(node, localName) {
  return descendants(node, localName)[0] || null;
}

function nodeText(node) {
  return node ? `${node.text}${node.children.map(nodeText).join("")}`.trim() : "";
}

function validCoordinate(lat, lng) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && lat !== 0
    && Number.isFinite(lng) && lng >= -180 && lng <= 180 && lng !== 0;
}

function coordinateTuples(value) {
  if (typeof value !== "string") return [];
  return value.trim().split(/\s+/).flatMap((tuple) => {
    const [lngText, latText] = tuple.split(",");
    const lat = Number(latText);
    const lng = Number(lngText);
    return validCoordinate(lat, lng) ? [{ lat, lng }] : [];
  });
}

function dedupeTrail(points) {
  return points.filter((point, index) => index === 0
    || point.lat !== points[index - 1].lat || point.lng !== points[index - 1].lng);
}

function nearestFolder(node) {
  let current = node?.parent;
  while (current && current.localName !== "Folder") current = current.parent;
  return current || null;
}

function extendedData(placemark) {
  return Object.fromEntries(descendants(placemark, "Data").map((node) => [
    node.attributes.name || "",
    nodeText(firstDescendant(node, "value")),
  ]));
}

export function allowedGarminFeedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && /^[-a-z0-9]+-share\.explore\.garmin\.com$/i.test(url.hostname)
      && (url.pathname.toLowerCase() === "/feed/share/missionamerica"
        || url.href === GARMIN_INREACH_III_URL);
  } catch {
    return false;
  }
}

export function parseGarminNetworkLink(xml) {
  const root = parseXml(xml);
  const networkLink = firstDescendant(root, "NetworkLink");
  const link = networkLink && firstDescendant(networkLink, "Link");
  const href = nodeText(link && firstDescendant(link, "href"));
  if (!allowedGarminFeedUrl(href)) throw new Error("invalid_garmin_network_link");
  const advertised = Number(nodeText(firstDescendant(link, "refreshInterval")));
  return {
    href,
    advertisedRefreshMs: Number.isFinite(advertised) && advertised > 0 ? advertised * 1000 : null,
    refreshMs: GARMIN_MIN_REFRESH_MS,
  };
}

export function parseGarminFeed(xml, { nowMs = Date.now(), freshMs = GARMIN_FRESH_MS } = {}) {
  const root = parseXml(xml);
  const points = descendants(root, "Placemark").flatMap((placemark) => {
    const point = firstDescendant(placemark, "Point");
    const position = coordinateTuples(nodeText(point && firstDescendant(point, "coordinates")))[0];
    const when = nodeText(firstDescendant(placemark, "when"));
    const observedMs = Date.parse(when);
    const data = extendedData(placemark);
    if (!position || !Number.isFinite(observedMs) || observedMs > nowMs + 5 * 60_000
      || /^false$/i.test(data["Valid GPS Fix"] || "")) return [];
    return [{ placemark, folder: nearestFolder(placemark), position, observedMs }];
  }).sort((left, right) => left.observedMs - right.observedMs);
  const latest = points.at(-1);
  if (!latest) return { available: false, trail: [] };

  const folderLines = descendants(latest.folder || root, "LineString")
    .map((line) => coordinateTuples(nodeText(firstDescendant(line, "coordinates"))))
    .filter((line) => line.length > 0)
    .sort((left, right) => right.length - left.length);
  const pointTrail = points.filter((point) => !latest.folder || point.folder === latest.folder).map((point) => point.position);
  let trail = folderLines[0]?.length > 1 ? folderLines[0] : pointTrail;
  if (!trail.some((point) => point.lat === latest.position.lat && point.lng === latest.position.lng)) {
    trail = [...trail, latest.position];
  }
  return {
    available: true,
    stale: nowMs - latest.observedMs > freshMs,
    observedAt: new Date(latest.observedMs).toISOString(),
    position: { ...latest.position },
    trail: dedupeTrail(trail).map((point) => ({ ...point })),
  };
}

export function resolveGarminDisplayLocation(result, lastKnown) {
  if (result?.available === true) return result;
  if (lastKnown?.available === true) return { ...lastKnown, stale: true };
  return { available: false, trail: [] };
}

async function fetchKml(target, { fetchImpl, proxyEndpoint, signal }) {
  const requestPath = `${proxyEndpoint}?${new URLSearchParams({ url: target })}`;
  const response = await fetchImpl(requestPath, {
    headers: { Accept: "application/vnd.google-earth.kml+xml, application/xml, text/xml", "Cache-Control": "no-cache", Pragma: "no-cache" },
    credentials: "omit",
    cache: "no-store",
    signal,
  });
  if (!response?.ok) throw new Error("garmin_feed_request_failed");
  const contentType = response.headers?.get?.("content-type") || "";
  if (!/^(?:application\/(?:vnd\.google-earth\.kml\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(contentType)) {
    throw new Error("garmin_feed_content_type");
  }
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_KML_BYTES) throw new Error("garmin_feed_too_large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_KML_BYTES) throw new Error("garmin_feed_too_large");
  return text;
}

export async function loadGarminRunnerLocation({
  fetchImpl = globalThis.fetch,
  proxyEndpoint = GARMIN_PROXY_ENDPOINT,
  feedUrl = null,
  timeoutMs = GARMIN_REQUEST_TIMEOUT_MS,
  nowMs = Date.now(),
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    if (feedUrl !== null) {
      if (!allowedGarminFeedUrl(feedUrl)) throw new Error("invalid_garmin_feed_url");
      const feed = await fetchKml(feedUrl, { fetchImpl, proxyEndpoint, signal: controller.signal });
      return parseGarminFeed(feed, { nowMs });
    }
    const loader = await fetchKml(GARMIN_LOADER_URL, { fetchImpl, proxyEndpoint, signal: controller.signal });
    const networkLink = parseGarminNetworkLink(loader);
    const feed = await fetchKml(networkLink.href, { fetchImpl, proxyEndpoint, signal: controller.signal });
    return parseGarminFeed(feed, { nowMs });
  } finally {
    clearTimeoutImpl(timeout);
  }
}
