#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadAndValidateManifest, parseArgs, resolveManifestInput, validationCommandsForRelease } from "./lib.mjs";

function run(command, args, label) {
  console.log(`Running ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.type || !args.release) throw new Error("--manifest, --type, and --release are required");
  const manifest = await loadAndValidateManifest(await resolveManifestInput(args.manifest), { expectedType: args.type, expectedRelease: args.release });
  const profile = validationCommandsForRelease(manifest.releaseType);
  console.log(`Validation profile: ${profile.join(", ")}`);
  run(process.execPath, ["--test", "tests/deploy-tooling.test.mjs"], "deployment tooling tests");
  const targeted = manifest.validation.targetedTests.filter((path) => path !== "tests/deploy-tooling.test.mjs");
  if (targeted.length) run(process.execPath, ["--test", ...targeted], "manifest-targeted tests");
  if (manifest.releaseType === "standard" || manifest.releaseType === "major") {
    run("npm", ["test"], "representative regression suite");
    run("npm", ["run", "build"], "site and cPanel build validation");
  }
  if (manifest.releaseType === "major") {
    run("npm", ["audit", "--audit-level=high"], "root dependency security audit");
    run("npm", ["--prefix", "strava-app", "audit", "--audit-level=high"], "backend dependency security audit");
    run("npm", ["run", "check:cpanel"], "cPanel package validation");
  }
}

main().catch((error) => {
  console.error(`Release validation failed: ${error.message}`);
  process.exitCode = 1;
});
