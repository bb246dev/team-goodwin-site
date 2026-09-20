import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { secretFindings } from "../scripts/deploy/scan-secrets.mjs";

const outputRoot = resolve(import.meta.dirname, "dist", "tracking-preview");
const manifest = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
const entries = [{ path: "asset-manifest.json" }, ...manifest.generatedFiles];
for (const entry of entries) {
  const bytes = readFileSync(join(outputRoot, entry.path));
  if (extname(entry.path).toLowerCase() === ".png") {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error(`${entry.path}: invalid PNG signature`);
    }
    console.log(`approved-binary-asset: ${entry.path}`);
    continue;
  }
  const findings = secretFindings(bytes.toString("utf8"));
  if (findings.length) throw new Error(`${entry.path}: ${findings.join(", ")}`);
  console.log(`scanned-text: ${entry.path}`);
}
console.log(`Secret scan accepted ${entries.length} tracking-preview file(s); none were skipped.`);
