import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repairFooter } from "./build-footer-preview.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [sourceArgument, deploymentArgument] = process.argv.slice(2);

if (!sourceArgument || !deploymentArgument) {
  throw new Error("usage: node scripts/validate-footer-deployment.mjs CURRENT_PRODUCTION_HTML_ROOT DEPLOYMENT_PUBLIC_HTML_ROOT");
}

const source = resolve(sourceArgument);
const deployment = resolve(deploymentArgument);

function files(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const sourceHtml = files(source).filter((path) => path.endsWith(".html"));
const expectedNames = [
  ...sourceHtml.map((path) => relative(source, path)),
  "assets/footer-social.css",
].sort();
const deploymentNames = files(deployment).map((path) => relative(deployment, path)).sort();

assert.deepEqual(deploymentNames, expectedNames, "deployment file allowlist");
assert.equal(sourceHtml.length, 16, "authoritative production HTML count");

for (const sourcePath of sourceHtml) {
  const name = relative(source, sourcePath);
  const original = readFileSync(sourcePath, "utf8");
  const candidate = readFileSync(join(deployment, name), "utf8");
  assert.equal(candidate, repairFooter(original), `${name}: footer-only transformation`);
  assert.match(candidate, /data-footer-repair="social-v1"/, `${name}: footer marker`);
}

assert.deepEqual(
  readFileSync(join(deployment, "assets", "footer-social.css")),
  readFileSync(join(root, "assets", "footer-social.css")),
  "deployment stylesheet bytes",
);

const publicContent = deploymentNames
  .map((name) => readFileSync(join(deployment, name), "utf8"))
  .join("\n");
assert.doesNotMatch(publicContent, /HAPN_(?:CLIENT_ID|CLIENT_SECRET|DEVICE_IMEI)/);
assert.doesNotMatch(publicContent, /Authorization:\s*Bearer/i);

console.log(`footer deployment passed: ${sourceHtml.length} exact HTML transformations and one stylesheet`);
