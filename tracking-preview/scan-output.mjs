import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { secretFindings } from "../scripts/deploy/scan-secrets.mjs";

const outputRoot = resolve(import.meta.dirname, "dist", "tracking-preview");
const manifest = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
const entries = [{ path: "asset-manifest.json" }, ...manifest.generatedFiles];
const textExtensions = new Set(["", ".css", ".html", ".js", ".json", ".mjs", ".svg"]);
const binaryExtensions = new Set([".avif", ".jpeg", ".jpg", ".mp4", ".png", ".woff2"]);

function validateBinary(path, bytes) {
  const extension = extname(path).toLowerCase();
  const valid = extension === ".png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : extension === ".jpg" || extension === ".jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : extension === ".woff2"
        ? bytes.subarray(0, 4).toString("ascii") === "wOF2"
        : extension === ".mp4" || extension === ".avif"
          ? bytes.subarray(4, 12).toString("ascii").includes("ftyp")
          : false;
  if (!valid) throw new Error(`${path}: invalid ${extension} signature`);
}

for (const entry of entries) {
  const bytes = readFileSync(join(outputRoot, entry.path));
  const extension = extname(entry.path).toLowerCase();
  if (binaryExtensions.has(extension)) {
    validateBinary(entry.path, bytes);
    console.log(`approved-binary-asset: ${entry.path}`);
    continue;
  }
  if (!textExtensions.has(extension)) throw new Error(`${entry.path}: unclassified output type`);
  let text = bytes.toString("utf8");
  if (entry.path === "asset-manifest.json") {
    for (const file of manifest.generatedFiles) {
      const url = new URL(file.url, "https://goodwingoodge.com");
      if (!url.pathname.startsWith("/tracking-preview/") || [...url.searchParams].some(([key]) => key !== "v")) {
        throw new Error(`${file.path}: invalid public manifest URL`);
      }
    }
    text = JSON.stringify(manifest, (key, value) => key === "url" ? undefined : value);
  }
  const findings = secretFindings(text);
  if (findings.length) throw new Error(`${entry.path}: ${findings.join(", ")}`);
  console.log(`scanned-text: ${entry.path}`);
}
console.log(`Secret scan accepted ${entries.length} tracking-preview file(s); none were skipped.`);
