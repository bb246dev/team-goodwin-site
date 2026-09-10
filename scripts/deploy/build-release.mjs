#!/usr/bin/env node
import { constants } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isMainModule, loadAndValidateManifest, parseArgs, publicManifest, resolveManifestInput } from "./lib.mjs";

export async function buildRelease({ manifestPath, outputDirectory, expectedType, expectedRelease, root = process.cwd() }) {
  const manifest = await loadAndValidateManifest(manifestPath, { root, expectedType, expectedRelease });
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
  release.sourceCommit = process.env.GITHUB_SHA || null;
  await writeFile(join(output, "release.json"), `${JSON.stringify(release, null, 2)}\n`, { flag: "wx" });
  return release;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.output) throw new Error("--manifest and --output are required");
  const release = await buildRelease({
    manifestPath: await resolveManifestInput(args.manifest),
    outputDirectory: args.output,
    expectedType: args.type,
    expectedRelease: args.release,
  });
  console.log(`Built immutable release candidate with ${release.files.length} file(s) at ${resolve(args.output)}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
