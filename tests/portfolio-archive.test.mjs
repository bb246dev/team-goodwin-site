import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(new URL("../portfolio/mission-america-2026/deploy.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/deploy-portfolio-archive.yml", import.meta.url), "utf8");
const standardDeploy = readFileSync(new URL("../scripts/deploy/lib.mjs", import.meta.url), "utf8");

test("portfolio deploy is hard-scoped and create-only", () => {
  assert.match(deploy, /public_html\/portfolio\/mission-america-2026\//);
  assert.match(deploy, /Archive root must be absent before provisioning/);
  assert.doesNotMatch(deploy, /\b(?:rm|unlink|rmdir|delete)\b/i);
  assert.match(deploy, /CONFIRM_PORTFOLIO_ARCHIVE_DEPLOY/);
});

test("portfolio workflow protects the current production homepage", () => {
  assert.match(workflow, /1efb150152a85624f8bc8f37145214c5fb413aa4db0b5f26063f33a169ec193f/g);
  assert.match(workflow, /concurrency:\n  group: production-deployment/);
});

test("standard production deploy does not permit portfolio destinations", () => {
  assert.doesNotMatch(standardDeploy, /portfolio\/mission-america-2026/);
  assert.ok(standardDeploy.includes("return /^public_html\\/(?:assets|data)\\/"));
});
