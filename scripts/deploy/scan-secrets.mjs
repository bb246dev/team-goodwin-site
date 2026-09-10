#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isMainModule, loadAndValidateManifest, parseArgs, resolveManifestInput } from "./lib.mjs";

const DEFINITE_SECRET_PATTERNS = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "live Stripe key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { name: "credential-bearing URL", pattern: /\b(?:ftp|https?):\/\/[^\s/:]+:[^\s/@]+@/i },
];
const ASSIGNMENT_PATTERN = /\b(?:password|passwd|private[_-]?key|client[_-]?secret|admin[_-]?token|access[_-]?token)\b\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi;
const PLACEHOLDER_PATTERN = /(?:test|example|placeholder|replace|changeme|your[-_ ]|dummy|redacted|not-a-real)/i;

export function secretFindings(text) {
  const findings = [];
  for (const candidate of DEFINITE_SECRET_PATTERNS) {
    if (candidate.pattern.test(text)) findings.push(candidate.name);
  }
  for (const match of text.matchAll(ASSIGNMENT_PATTERN)) {
    if (!PLACEHOLDER_PATTERN.test(match[1])) findings.push("credential assignment");
  }
  return [...new Set(findings)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) throw new Error("--manifest is required");
  const manifest = await loadAndValidateManifest(await resolveManifestInput(args.manifest), { expectedType: args.type, expectedRelease: args.release });
  const failures = [];
  for (const file of manifest.files) {
    if (file.size > 5_000_000) continue;
    const content = await readFile(file.absoluteSource);
    if (content.includes(0)) continue;
    const findings = secretFindings(content.toString("utf8"));
    if (findings.length) failures.push(`${file.source}: ${findings.join(", ")}`);
  }
  if (failures.length) throw new Error(`Potential secret(s) found in deployment sources:\n${failures.join("\n")}`);
  console.log(`Secret scan passed for ${manifest.files.length} manifest source file(s)`);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Secret scan failed: ${error.message}`);
    process.exitCode = 1;
  });
}
