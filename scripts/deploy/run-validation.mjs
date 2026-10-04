#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isMainModule, loadAndValidateManifest, parseArgs, resolveManifestInput, sha256, validationCommandsForRelease } from "./lib.mjs";

const ALLOWED_BUILD_OUTPUTS = Object.freeze(["dist"]);
const COPY_EXCLUSIONS = new Set([".git", "node_modules", "deployment-plan", "deployment-release", "deployment-results"]);

function run(command, args, label, cwd = process.cwd()) {
  console.log(`Running ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function inventory(root) {
  const files = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`Isolated build workspace contains a symlink: ${name}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const content = await readFile(path);
        files.set(name, { sha256: sha256(content), size: content.byteLength });
      }
    }
  }
  await visit(root);
  return files;
}

function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => JSON.stringify(before.get(path)) !== JSON.stringify(after.get(path)))
    .sort();
}

function isAllowedBuildChange(path) {
  return ALLOWED_BUILD_OUTPUTS.some((directory) => path === directory || path.startsWith(`${directory}/`));
}

export async function createValidatedWorkspace({ root, workspace, inventoryPath, manifestPath, releaseType }) {
  const sourceRoot = await realpath(root);
  const destination = resolve(workspace);
  if (destination === sourceRoot || destination.startsWith(`${sourceRoot}${sep}`)) throw new Error("Build workspace must be outside the repository checkout");
  if (await lstat(destination).catch(() => null)) throw new Error(`Build workspace already exists: ${destination}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(sourceRoot, destination, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sourceRoot, source);
      return !rel.split(sep).some((part) => COPY_EXCLUSIONS.has(part));
    },
  });
  const before = await inventory(destination);
  if (releaseType === "standard" || releaseType === "major") run("npm", ["run", "build"], "isolated site and cPanel build validation", destination);
  if (releaseType === "major") run("npm", ["run", "check:cpanel"], "isolated cPanel package validation", destination);
  const after = await inventory(destination);
  const changes = changedPaths(before, after);
  const forbidden = changes.filter((path) => !isAllowedBuildChange(path));
  if (forbidden.length) throw new Error(`Build modified files outside allowed output locations (${ALLOWED_BUILD_OUTPUTS.join(", ")}): ${forbidden.join(", ")}`);
  const isolatedManifestPath = resolve(destination, relative(sourceRoot, manifestPath));
  const manifest = await loadAndValidateManifest(isolatedManifestPath, { root: destination });
  const sources = Object.fromEntries(manifest.files.map((file) => [file.source, { sha256: file.newSha256, size: file.size }]));
  const outputFiles = Object.fromEntries([...after].filter(([path]) => isAllowedBuildChange(path)).sort(([a], [b]) => a.localeCompare(b)));
  const record = {
    schemaVersion: 1,
    allowedBuildOutputLocations: [...ALLOWED_BUILD_OUTPUTS],
    changedFiles: changes,
    outputFiles,
    sources,
  };
  await writeFile(inventoryPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Validated isolated workspace: ${changes.length} build change(s), all within ${ALLOWED_BUILD_OUTPUTS.join(", ")}`);
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.type || !args.release || !args.workspace || !args.inventory) throw new Error("--manifest, --type, --release, --workspace, and --inventory are required");
  const root = process.cwd();
  const manifestPath = await resolveManifestInput(args.manifest);
  const manifest = await loadAndValidateManifest(manifestPath, { expectedType: args.type, expectedRelease: args.release });
  const profile = validationCommandsForRelease(manifest.releaseType);
  console.log(`Validation profile: ${profile.join(", ")}`);
  run(process.execPath, ["--test", "tests/deploy-tooling.test.mjs"], "deployment tooling tests");
  const targeted = manifest.validation.targetedTests.filter((path) => path !== "tests/deploy-tooling.test.mjs");
  if (targeted.length) run(process.execPath, ["--test", ...targeted], "manifest-targeted tests");
  if (manifest.releaseType === "standard" || manifest.releaseType === "major") run("npm", ["test"], "representative regression suite");
  if (manifest.releaseType === "major") {
    run("npm", ["audit", "--audit-level=high"], "root dependency security audit");
    run("npm", ["--prefix", "strava-app", "audit", "--audit-level=high"], "backend dependency security audit");
  }
  await createValidatedWorkspace({ root, workspace: args.workspace, inventoryPath: args.inventory, manifestPath, releaseType: manifest.releaseType });
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
