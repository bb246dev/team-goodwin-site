import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyApprovedSponsorFooter } from "./sponsor-footer.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pageNames = [
  "index",
  "accessibility",
  "athletes",
  "faq",
  "fifty-runs",
  "live-tracking",
  "participation-terms",
  "partners",
  "privacy",
  "terms",
  "the-run",
  "updates",
  "week-1",
  "week-2",
  "week-3",
  "will",
];

export function buildSponsorFooterRelease() {
  const outputs = [];
  for (const pageName of pageNames) {
    const source = resolve(root, `restore-2026-09-30-${pageName}.html`);
    const destination = resolve(root, `sponsor-release-2026-10-04-${pageName}.html`);
    const restored = readFileSync(source, "utf8");
    const updated = applyApprovedSponsorFooter(restored);
    writeFileSync(destination, updated);
    outputs.push(destination);
  }

  const metadataSource = resolve(root, "assets/partners/partners.json");
  const metadataDestination = resolve(root, "assets/releases/sponsor-footer-2026-10-04/partners.json");
  mkdirSync(resolve(metadataDestination, ".."), { recursive: true });
  copyFileSync(metadataSource, metadataDestination);
  outputs.push(metadataDestination);
  return outputs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputs = buildSponsorFooterRelease();
  console.log(`sponsor footer release: ${outputs.length} exact output files generated`);
}
