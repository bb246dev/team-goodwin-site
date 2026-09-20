import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createFtpsClient } from "../scripts/deploy/ftps-client.mjs";

const expectedRef = "refs/heads/codex/tracking-preview-leaflet";
const outputRoot = resolve(import.meta.dirname, "dist", "tracking-preview");
const destinationRoot = "public_html/tracking-preview/";
const allowedAsset = /^assets\/(?:app|feeds|tracking-map|route-data|leaflet|tracking-preview|will-marker|rv-marker)-[a-f0-9]{16}\.(?:mjs|css|png)$/;
const allowedProductionAsset = /^site\/(?:assets|fonts)\/[a-zA-Z0-9._/-]+\.(?:js|css|png|jpe?g|svg|avif|mp4|woff2)$/;

function visit(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? visit(join(directory, entry.name), `${relative}/`) : [relative];
  });
}

function safeFile(file) {
  if (file.includes("..") || file.includes("//") || file.startsWith("/")) return false;
  return file === ".htaccess" || file === "index.html" || file === "asset-manifest.json"
    || allowedAsset.test(file) || allowedProductionAsset.test(file);
}

if (process.env.GITHUB_REF !== expectedRef) {
  throw new Error(`Tracking preview deployment requires ${expectedRef}`);
}
const manifest = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
if (manifest.prefix !== "/tracking-preview" || !Array.isArray(manifest.generatedFiles)) {
  throw new Error("Invalid tracking preview manifest");
}
const files = ["asset-manifest.json", ...manifest.generatedFiles.map((entry) => entry.path)].sort();
if (new Set(files).size !== files.length || files.some((file) => !safeFile(file))) {
  throw new Error("Tracking preview upload inventory contains a disallowed file");
}
const actual = visit(outputRoot).sort();
if (JSON.stringify(files) !== JSON.stringify(actual)) throw new Error("Tracking preview upload inventory does not match build output");

if (process.env.TRACKING_PREVIEW_VALIDATE_ONLY === "1") {
  console.log(`Validated tracking-preview upload inventory: ${files.length} files; destination ${destinationRoot}`);
} else {
  const client = createFtpsClient(process.env, { createDirectories: true });
  for (const file of files) {
    const source = join(outputRoot, file);
    if (!statSync(source).isFile()) throw new Error(`Missing tracking preview file: ${file}`);
    const destination = `${destinationRoot}${file}`;
    if (!destination.startsWith(destinationRoot) || destination.includes("..")) {
      throw new Error("Tracking preview destination escaped its boundary");
    }
    await client.upload(source, destination);
    const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    console.log(`Uploaded ${destination} sha256:${sha256}`);
  }
}
