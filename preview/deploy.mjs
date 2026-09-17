import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createFtpsClient } from "../scripts/deploy/ftps-client.mjs";

const root = resolve(import.meta.dirname, "dist");
const routes = [
  "index", "live-tracking", "the-run", "will", "fifty-runs", "updates",
  "faq", "week-1", "week-2", "week-3", "partners", "athletes",
  "privacy", "terms", "participation-terms", "accessibility",
];
const files = [
  ".htaccess",
  "assets/tracker-base.js",
  "assets/strava-race-map.mjs",
  ...routes.map((route) => route === "index" ? "index.html" : `${route}/index.html`),
];

if (process.env.GITHUB_REF !== "refs/heads/client-preview-open-feeds") {
  throw new Error("Preview deployment requires the dedicated client-preview-open-feeds branch");
}
const client = createFtpsClient(process.env, { createDirectories: true });
for (const file of files) {
  const source = join(root, file);
  if (!statSync(source).isFile()) throw new Error(`Missing preview file: ${file}`);
  const destination = `public_html/client-preview/${file}`;
  if (!destination.startsWith("public_html/client-preview/")) throw new Error("Preview destination escaped its boundary");
  await client.upload(source, destination);
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
  console.log(`Uploaded ${destination} sha256:${hash}`);
}
