#!/usr/bin/env node
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isMainModule, loadAndValidateManifest, parseArgs, publicManifest, resolveManifestInput, sha256 } from "./lib.mjs";
import { scanManifestSources } from "./scan-secrets.mjs";

export async function buildRelease({ manifestPath, outputDirectory, expectedType, expectedRelease, root = process.cwd(), releaseCommit, validatedInventoryPath }) {
  if (!/^[a-f0-9]{40}$/.test(releaseCommit || "")) throw new Error("releaseCommit must be an explicitly supplied full lowercase Git commit SHA");
  if (!validatedInventoryPath) throw new Error("validatedInventoryPath is required");
  const manifest = await loadAndValidateManifest(manifestPath, { root, expectedType, expectedRelease });
  const inventoryContent = await readFile(validatedInventoryPath);
  let inventory;
  try { inventory = JSON.parse(inventoryContent); }
  catch (error) { throw new Error(`Validated output inventory is invalid JSON: ${error.message}`); }
  if (inventory.schemaVersion !== 1 || !inventory.sources || typeof inventory.sources !== "object") throw new Error("Validated output inventory is malformed");
  for (const file of manifest.files) {
    const accepted = inventory.sources[file.source];
    if (!accepted || accepted.sha256 !== file.newSha256 || accepted.size !== file.size) {
      throw new Error(`Release source does not match validated output inventory: ${file.source}`);
    }
  }
  const sourceValidation = await scanManifestSources(manifest);
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: false });
  await mkdir(join(output, "files"), { recursive: false });
  const release = publicManifest(manifest);
  for (let index = 0; index < manifest.files.length; index += 1) {
    const file = manifest.files[index];
    const packagedPath = `files/${String(index + 1).padStart(4, "0")}-${basename(file.source)}`;
    await copyFile(file.absoluteSource, join(output, packagedPath), constants.COPYFILE_EXCL);
    release.files[index].packagedPath = packagedPath;
  }
  release.createdAt = new Date().toISOString();
  release.sourceCommit = releaseCommit;
  release.validatedOutputInventorySha256 = sha256(inventoryContent);
  release.sourceValidation = sourceValidation;
  await writeFile(join(output, "validated-output-inventory.json"), inventoryContent, { flag: "wx" });
  await writeFile(join(output, "release.json"), `${JSON.stringify(release, null, 2)}\n`, { flag: "wx" });
  return release;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.output || !args.root || !args.inventory || !args["release-commit"]) throw new Error("--manifest, --output, --root, --inventory, and --release-commit are required");
  const release = await buildRelease({
    manifestPath: await resolveManifestInput(args.manifest, resolve(args.root)),
    outputDirectory: args.output,
    expectedType: args.type,
    expectedRelease: args.release,
    root: resolve(args.root),
    releaseCommit: args["release-commit"],
    validatedInventoryPath: resolve(args.inventory),
  });
  console.log(`Built immutable release candidate with ${release.files.length} file(s) at ${resolve(args.output)}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
