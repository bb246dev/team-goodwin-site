import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [mode, snapshotPath] = process.argv.slice(2);
const origin = process.env.PREVIEW_ORIGIN || "https://goodwingoodge.com";
const fixedPaths = [
  "/",
  "/assets/tracker-base.js",
  "/assets/strava-race-map.mjs",
  "/client-preview/",
  "/client-preview/live-tracking/",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function referencedAssets(html) {
  return [...html.matchAll(/(?:href|src|poster)=["'](\/[^"'#?]+(?:\?[^"'#]*)?)["']/g)]
    .map((match) => match[1])
    .filter((path) => /^\/(?:assets|fonts|client-preview\/assets)\//.test(path));
}

async function capture(paths) {
  const pending = [...new Set(paths)];
  const captured = {};
  for (let index = 0; index < pending.length; index += 1) {
    const path = pending[index];
    if (path.startsWith("/tracking-preview")) throw new Error("Boundary snapshot cannot include tracking-preview");
    const response = await fetch(new URL(path, origin), { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
    if (!response.ok) throw new Error(`Boundary ${path} returned ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    captured[path] = { sha256: sha256(bytes), bytes: bytes.length, contentType: response.headers.get("content-type") || "" };
    if (captured[path].contentType.includes("text/html")) {
      for (const asset of referencedAssets(bytes.toString("utf8"))) if (!pending.includes(asset)) pending.push(asset);
    }
  }
  return captured;
}

if (!snapshotPath || !["record", "compare"].includes(mode)) {
  throw new Error("Usage: node tracking-preview/boundary.mjs <record|compare> <snapshot-file>");
}

if (mode === "record") {
  const captured = await capture(fixedPaths);
  writeFileSync(snapshotPath, `${JSON.stringify({ origin, captured }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Recorded ${Object.keys(captured).length} production/client-preview boundary resources.`);
} else {
  const before = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (before.origin !== origin || !before.captured || typeof before.captured !== "object") throw new Error("Invalid boundary snapshot");
  const after = await capture(Object.keys(before.captured));
  const beforeJson = JSON.stringify(before.captured);
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    const changed = Object.keys(before.captured).filter((path) => JSON.stringify(before.captured[path]) !== JSON.stringify(after[path]));
    throw new Error(`Production boundary changed: ${changed.join(", ")}`);
  }
  console.log(`Verified ${Object.keys(after).length} production/client-preview resources byte-for-byte unchanged.`);
}
