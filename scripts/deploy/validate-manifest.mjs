#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { loadAndValidateManifest, parseArgs, publicManifest, resolveManifestInput } from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) throw new Error("--manifest is required");
  const manifestPath = await resolveManifestInput(args.manifest, process.cwd(), args.mode);
  const manifest = await loadAndValidateManifest(manifestPath, {
    expectedType: args.type,
    expectedRelease: args.release,
  });
  const output = publicManifest(manifest);
  if (args.output) await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(`Validated ${output.deploymentType} ${output.releaseType} manifest: ${output.files.length} file(s)`);
  for (const file of output.files) console.log(`${file.newSha256}  ${file.source} -> ${file.destination}`);
}

main().catch((error) => {
  console.error(`Manifest validation failed: ${error.message}`);
  process.exitCode = 1;
});
