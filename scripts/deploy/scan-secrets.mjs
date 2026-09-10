#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { isMainModule, loadAndValidateManifest, parseArgs, resolveManifestInput } from "./lib.mjs";

const DEFINITE_SECRET_PATTERNS = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "live Stripe key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { name: "credential-bearing URL", pattern: /\b(?:ftp|https?):\/\/[A-Za-z0-9._%+-]+:[^@\s/"'{}[\],]+@/i },
];
const ASSIGNMENT_PATTERN = /\b(?:password|passwd|private[_-]?key|client[_-]?secret|admin[_-]?token|access[_-]?token)\b\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi;
const PLACEHOLDER_PATTERN = /(?:test|example|placeholder|replace|changeme|your[-_ ]|dummy|redacted|not-a-real)/i;
const SAFE_BINARY_EXTENSIONS = new Set([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp", ".woff", ".woff2"]);
const FORBIDDEN_BINARY_EXTENSIONS = new Set([".7z", ".class", ".db", ".dll", ".dylib", ".exe", ".gz", ".jar", ".rar", ".so", ".sqlite", ".tar", ".wasm", ".zip"]);

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

function hasSafeBinarySignature(extension, bytes) {
  const ascii = bytes.toString("ascii");
  if ([".jpg", ".jpeg"].includes(extension)) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === ".png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === ".gif") return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
  if (extension === ".webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (extension === ".avif") return ascii.slice(4, 12) === "ftypavif" || ascii.slice(4, 12) === "ftypavis";
  if (extension === ".ico") return bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  if (extension === ".woff") return ascii.startsWith("wOFF");
  if (extension === ".woff2") return ascii.startsWith("wOF2");
  return false;
}

async function validateBinaryAsset(file) {
  if (!file.expectedSha256) throw new Error(`${file.source}: binary assets require expectedSha256`);
  const extension = extname(file.source).toLowerCase();
  if (!SAFE_BINARY_EXTENSIONS.has(extension)) throw new Error(`${file.source}: binary asset type is not permitted`);
  const handle = await open(file.absoluteSource, "r");
  try {
    const bytes = Buffer.alloc(32);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (!hasSafeBinarySignature(extension, bytes.subarray(0, bytesRead))) {
      throw new Error(`${file.source}: binary signature does not match its approved media/font type`);
    }
  } finally {
    await handle.close();
  }
}

async function scanTextFile(file) {
  const extension = extname(file.source).toLowerCase();
  if (SAFE_BINARY_EXTENSIONS.has(extension)) throw new Error(`${file.source}: binary-looking asset extensions require explicit contentType binary-asset`);
  if (FORBIDDEN_BINARY_EXTENSIONS.has(extension)) throw new Error(`${file.source}: executable, archive, or database files are never permitted`);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  let firstChunk = true;
  const findings = new Set();
  try {
    for await (const chunk of createReadStream(file.absoluteSource, { highWaterMark: 64 * 1024 })) {
      if (firstChunk) {
        firstChunk = false;
        const ascii = chunk.subarray(0, 8).toString("ascii");
        if (ascii.startsWith("MZ") || ascii.startsWith("\u007fELF") || ascii.startsWith("PK\u0003\u0004") || (chunk[0] === 0x1f && chunk[1] === 0x8b)) {
          throw new Error(`${file.source}: executable or archive signature is never permitted`);
        }
      }
      const text = carry + decoder.decode(chunk, { stream: true });
      for (const finding of secretFindings(text)) findings.add(finding);
      carry = text.slice(-8192);
    }
    const finalText = carry + decoder.decode();
    for (const finding of secretFindings(finalText)) findings.add(finding);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`${file.source}: invalid UTF-8 text is rejected`);
    throw error;
  }
  if (findings.size) throw new Error(`${file.source}: ${[...findings].join(", ")}`);
}

export async function scanManifestSources(manifest) {
  const results = [];
  for (const file of manifest.files) {
    if (file.contentType === "binary-asset") {
      await validateBinaryAsset(file);
      results.push({ source: file.source, status: "approved-binary-asset", sha256: file.newSha256, size: file.size });
    } else {
      await scanTextFile(file);
      results.push({ source: file.source, status: "scanned-text", sha256: file.newSha256, size: file.size });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) throw new Error("--manifest is required");
  const root = resolve(args.root || process.cwd());
  const manifestPath = await resolveManifestInput(args.manifest, root);
  const manifest = await loadAndValidateManifest(manifestPath, { root, expectedType: args.type, expectedRelease: args.release });
  const results = await scanManifestSources(manifest);
  for (const result of results) console.log(`${result.status}: ${result.source} (${result.size} bytes, ${result.sha256})`);
  console.log(`Secret scan accepted ${results.length} manifest source file(s); none were skipped`);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(`Secret scan failed: ${error.message}`);
    process.exitCode = 1;
  });
}
