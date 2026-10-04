import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_LEVELS = Object.freeze(["micro", "standard", "major"]);
export const DEPLOYMENT_TYPES = Object.freeze(["static", "backend"]);

export const STATIC_PROTECTED_PATHS = Object.freeze([
  "public_html/assets/tracker-base.js",
  "public_html/assets/strava-race-map.mjs",
  "public_html/.htaccess",
]);

const CREDENTIAL_PATH_PATTERN = /(^|\/)(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ecdsa|ed25519))(?:$|\/)/i;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+@()/ -]*$/;
const FORBIDDEN_PATH_PATTERN = /[\\*?\[\]{};$`|&<>!\r\n\0]/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "deploymentType",
  "releaseType",
  "previousReleaseGeneration",
  "exampleOnly",
  "description",
  "protectedPathsApproved",
  "files",
  "validation",
]);
const FILE_KEYS = new Set(["source", "destination", "publicPath", "contentType", "expectedSha256", "expectedRemoteSha256", "expectedRemoteAbsent"]);
const VALIDATION_KEYS = new Set(["targetedTests", "browserRoutes", "apiChecks"]);
const API_CHECK_KEYS = new Set(["name", "path", "expectedStatus", "requiredJsonFields"]);
const RELEASE_KEYS = new Set([...TOP_LEVEL_KEYS, "createdAt", "sourceCommit", "expectedReleaseGeneration", "validatedOutputInventorySha256", "sourceValidation"]);
const RELEASE_FILE_KEYS = new Set([...FILE_KEYS, "newSha256", "size", "packagedPath"]);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected positional argument: ${value}`);
    const key = value.slice(2);
    if (!key) throw new Error("Empty option name");
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

export function isMainModule(moduleUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(moduleUrl) === resolve(process.argv[1]);
}

export function assertNoUnknownKeys(value, allowed, context) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${context} contains unknown field: ${key}`);
  }
}

export function normalizeRelativePath(value, context) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${context} must be a non-empty, trimmed string`);
  }
  if (isAbsolute(value) || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw new Error(`${context} must be repository/server-root relative`);
  }
  if (!SAFE_PATH_PATTERN.test(value) || FORBIDDEN_PATH_PATTERN.test(value)) {
    throw new Error(`${context} contains forbidden characters`);
  }
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${context} is not a normalized safe path`);
  }
  return normalized;
}

function normalizePublicPath(value, context) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`${context} must begin with one slash`);
  }
  if (value.includes("..") || /[\\?#\r\n\0]/.test(value)) {
    throw new Error(`${context} contains forbidden URL characters`);
  }
  return value;
}

function isAllowedStaticDestination(destination) {
  if (destination === "public_html/.htaccess") return true;
  if (/^public_html\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(destination)) return true;
  return /^public_html\/(?:assets|data)\/[A-Za-z0-9][A-Za-z0-9._+@()/ -]*$/.test(destination);
}

function isAllowedStaticSource(source, destination) {
  if (destination === "public_html/.htaccess") {
    return source === ".htaccess" || source === "dist/.htaccess" || source.startsWith("deploy/static/");
  }
  if (destination.endsWith(".html")) {
    return /^(?:dist\/)?[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(source);
  }
  if (destination.startsWith("public_html/assets/")) {
    return /^(?:dist\/)?assets\/.+/.test(source);
  }
  if (destination.startsWith("public_html/data/")) {
    return /^(?:dist\/)?data\/.+/.test(source);
  }
  return false;
}

function isAllowedBackendSource(source) {
  return /^(?:strava-app|dist\/goodwin-strava-api)\/.+/.test(source)
    && !source.includes("/node_modules/")
    && !CREDENTIAL_PATH_PATTERN.test(source);
}

function expectedPublicPath(destination) {
  if (destination === "public_html/.htaccess") return "/";
  if (destination === "public_html/index.html") return "/";
  if (/^public_html\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(destination)) {
    return `/${basename(destination, ".html")}/`;
  }
  return `/${destination.slice("public_html/".length)}`;
}

export function isProtectedDestination(type, destination) {
  if (type === "static") return STATIC_PROTECTED_PATHS.includes(destination);
  return type === "backend";
}

function validateTestPath(value, context) {
  const path = normalizeRelativePath(value, context);
  if (!/^tests\/[A-Za-z0-9][A-Za-z0-9._/-]*\.test\.mjs$/.test(path)) {
    throw new Error(`${context} must name a tests/*.test.mjs file`);
  }
  return path;
}

function validateApiCheck(check, index) {
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    throw new Error(`validation.apiChecks[${index}] must be an object`);
  }
  assertNoUnknownKeys(check, API_CHECK_KEYS, `validation.apiChecks[${index}]`);
  if (typeof check.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(check.name)) {
    throw new Error(`validation.apiChecks[${index}].name is invalid`);
  }
  const path = normalizePublicPath(check.path, `validation.apiChecks[${index}].path`);
  const expectedStatus = check.expectedStatus ?? 200;
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw new Error(`validation.apiChecks[${index}].expectedStatus is invalid`);
  }
  const requiredJsonFields = check.requiredJsonFields ?? [];
  if (!Array.isArray(requiredJsonFields) || requiredJsonFields.some((field) => typeof field !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field))) {
    throw new Error(`validation.apiChecks[${index}].requiredJsonFields is invalid`);
  }
  return { name: check.name, path, expectedStatus, requiredJsonFields };
}

export async function validateManifestObject(manifest, options = {}) {
  const { root = process.cwd(), expectedType, expectedRelease, requireSources = true, mode } = options;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Manifest must be a JSON object");
  assertNoUnknownKeys(manifest, TOP_LEVEL_KEYS, "manifest");
  if (manifest.schemaVersion !== 1) throw new Error("manifest.schemaVersion must be 1");
  if (!DEPLOYMENT_TYPES.includes(manifest.deploymentType)) throw new Error("manifest.deploymentType must be static or backend");
  if (expectedType && manifest.deploymentType !== expectedType) throw new Error(`Manifest type ${manifest.deploymentType} does not match ${expectedType}`);
  if (!RELEASE_LEVELS.includes(manifest.releaseType)) throw new Error("manifest.releaseType must be micro, standard, or major");
  if (expectedRelease && manifest.releaseType !== expectedRelease) throw new Error(`Manifest release ${manifest.releaseType} does not match ${expectedRelease}`);
  if (manifest.description !== undefined && (typeof manifest.description !== "string" || manifest.description.length > 300)) {
    throw new Error("manifest.description must be a string of at most 300 characters");
  }
  if (manifest.exampleOnly !== undefined && manifest.exampleOnly !== true) throw new Error("manifest.exampleOnly must be true when supplied");
  if (mode === "deploy" && manifest.exampleOnly === true) throw new Error("Example-only manifests cannot enter deploy mode, even after being copied");
  if (manifest.deploymentType === "backend") {
    if (manifest.releaseType !== "major") throw new Error("Every backend deployment requires a major release");
    if (typeof manifest.previousReleaseGeneration !== "string" || !SHA256_PATTERN.test(manifest.previousReleaseGeneration)) {
      throw new Error("Backend manifest previousReleaseGeneration must be the approved lowercase pre-deployment SHA-256 reported by runtime-status");
    }
  } else if (manifest.previousReleaseGeneration !== undefined) {
    throw new Error("previousReleaseGeneration is permitted only for backend manifests");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > 200) {
    throw new Error("manifest.files must contain 1-200 entries");
  }
  const approvals = manifest.protectedPathsApproved ?? [];
  if (!Array.isArray(approvals)) throw new Error("manifest.protectedPathsApproved must be an array");
  const normalizedApprovals = approvals.map((value, index) => normalizeRelativePath(value, `protectedPathsApproved[${index}]`));
  if (new Set(normalizedApprovals).size !== normalizedApprovals.length) throw new Error("protectedPathsApproved contains duplicates");

  const repoRoot = await realpath(root);
  const destinations = new Set();
  const files = [];
  for (let index = 0; index < manifest.files.length; index += 1) {
    const file = manifest.files[index];
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error(`files[${index}] must be an object`);
    assertNoUnknownKeys(file, FILE_KEYS, `files[${index}]`);
    const source = normalizeRelativePath(file.source, `files[${index}].source`);
    const destination = normalizeRelativePath(file.destination, `files[${index}].destination`);
    if (CREDENTIAL_PATH_PATTERN.test(destination)) throw new Error(`Credential destination is never permitted: ${destination}`);
    if (destinations.has(destination)) throw new Error(`Duplicate destination: ${destination}`);
    destinations.add(destination);

    if (manifest.deploymentType === "static") {
      if (!isAllowedStaticDestination(destination)) throw new Error(`Static destination is outside the allowlist: ${destination}`);
      if (!isAllowedStaticSource(source, destination)) throw new Error(`Static source is unexpected for ${destination}: ${source}`);
      if (destination === "public_html/.htaccess" && manifest.releaseType !== "major") {
        throw new Error("A .htaccess deployment requires a major release");
      }
      if (file.publicPath === undefined) throw new Error(`files[${index}].publicPath is required for static files`);
      const publicPath = normalizePublicPath(file.publicPath, `files[${index}].publicPath`);
      if (publicPath !== expectedPublicPath(destination)) {
        throw new Error(`files[${index}].publicPath must be ${expectedPublicPath(destination)} for ${destination}`);
      }
    } else {
      if (!destination.startsWith("goodwin-node-test/") || destination === "goodwin-node-test/") {
        throw new Error(`Backend destination is outside the allowlist: ${destination}`);
      }
      if (!isAllowedBackendSource(source)) throw new Error(`Backend source is unexpected: ${source}`);
      if (file.publicPath !== undefined) throw new Error(`files[${index}].publicPath is not permitted for backend files`);
    }

    const protectedDestination = isProtectedDestination(manifest.deploymentType, destination);
    if (protectedDestination && !normalizedApprovals.includes(destination)) {
      throw new Error(`Protected destination requires exact protectedPathsApproved entry: ${destination}`);
    }
    if (file.expectedSha256 !== undefined && (typeof file.expectedSha256 !== "string" || !SHA256_PATTERN.test(file.expectedSha256))) {
      throw new Error(`files[${index}].expectedSha256 must be a lowercase SHA-256`);
    }
    if (file.expectedRemoteSha256 !== undefined && (typeof file.expectedRemoteSha256 !== "string" || !SHA256_PATTERN.test(file.expectedRemoteSha256))) {
      throw new Error(`files[${index}].expectedRemoteSha256 must be a lowercase SHA-256`);
    }
    if (file.expectedRemoteAbsent !== undefined && file.expectedRemoteAbsent !== true) {
      throw new Error(`files[${index}].expectedRemoteAbsent must be true when supplied`);
    }
    const hasExpectedRemoteHash = file.expectedRemoteSha256 !== undefined;
    const expectsRemoteAbsent = file.expectedRemoteAbsent === true;
    if (hasExpectedRemoteHash === expectsRemoteAbsent) {
      throw new Error(`files[${index}] must declare exactly one prior state: expectedRemoteSha256 or expectedRemoteAbsent: true`);
    }
    if (file.contentType !== undefined && !["text", "binary-asset"].includes(file.contentType)) {
      throw new Error(`files[${index}].contentType must be text or binary-asset`);
    }
    if (protectedDestination && !file.expectedSha256) {
      throw new Error(`Protected destination requires an approved new/source expectedSha256: ${destination}`);
    }

    const absoluteSource = resolve(repoRoot, source);
    if (absoluteSource !== repoRoot && !absoluteSource.startsWith(`${repoRoot}${sep}`)) throw new Error(`Source escapes repository: ${source}`);
    let newSha256;
    let size;
    if (requireSources) {
      const stat = await lstat(absoluteSource).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`Source must be an existing regular file: ${source}`);
      const resolvedSource = await realpath(absoluteSource);
      if (!resolvedSource.startsWith(`${repoRoot}${sep}`)) throw new Error(`Source symlink escapes repository: ${source}`);
      const content = await readFile(resolvedSource);
      newSha256 = sha256(content);
      size = content.byteLength;
      if (file.expectedSha256 && file.expectedSha256 !== newSha256) {
        throw new Error(`Approved new/source hash does not match expectedSha256: ${source}`);
      }
    }
    files.push({ ...file, source, destination, publicPath: file.publicPath, newSha256, size, absoluteSource });
  }

  for (const approved of normalizedApprovals) {
    if (!destinations.has(approved)) throw new Error(`Protected approval does not match a manifest destination: ${approved}`);
    if (!isProtectedDestination(manifest.deploymentType, approved)) throw new Error(`Path is approved as protected but is not protected: ${approved}`);
  }

  const validation = manifest.validation ?? {};
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) throw new Error("manifest.validation must be an object");
  assertNoUnknownKeys(validation, VALIDATION_KEYS, "validation");
  const targetedTests = (validation.targetedTests ?? []).map(validateTestPath);
  if (targetedTests.length === 0) throw new Error("validation.targetedTests must contain at least one targeted test");
  if (new Set(targetedTests).size !== targetedTests.length) throw new Error("validation.targetedTests contains duplicates");
  if (requireSources) {
    for (const testPath of targetedTests) {
      const stat = await lstat(resolve(repoRoot, testPath)).catch(() => null);
      if (!stat?.isFile()) throw new Error(`Targeted test does not exist: ${testPath}`);
    }
  }
  const browserRoutes = (validation.browserRoutes ?? []).map((value, index) => normalizePublicPath(value, `validation.browserRoutes[${index}]`));
  const apiChecks = (validation.apiChecks ?? []).map(validateApiCheck);
  if (manifest.deploymentType === "static" && browserRoutes.length === 0) {
    throw new Error("Static manifests require at least one representative browser route");
  }
  if (manifest.deploymentType === "static" && manifest.releaseType !== "micro" && browserRoutes.length < 2) {
    throw new Error("Standard and major static manifests require at least two representative browser routes");
  }
  if (manifest.deploymentType === "static" && manifest.releaseType !== "micro") {
    for (const requiredRoute of ["/", "/live-tracking/"]) {
      if (!browserRoutes.includes(requiredRoute)) throw new Error(`Standard and major static manifests require browser route ${requiredRoute}`);
    }
    for (const requiredApiPath of ["/strava/health", "/strava/public/race-status", "/strava/public/tracking-status"]) {
      if (!apiChecks.some((check) => check.path === requiredApiPath)) throw new Error(`Standard and major static manifests require API check ${requiredApiPath}`);
    }
  }
  if (manifest.deploymentType === "backend" && apiChecks.length === 0) {
    throw new Error("Backend manifests require at least one public API check");
  }

  return {
    ...manifest,
    protectedPathsApproved: normalizedApprovals,
    files,
    validation: { targetedTests, browserRoutes, apiChecks },
  };
}

export async function loadAndValidateManifest(path, options = {}) {
  const raw = await readFile(path, "utf8");
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch (error) { throw new Error(`Manifest is not valid JSON: ${error.message}`); }
  return validateManifestObject(manifest, options);
}

export async function resolveManifestInput(value, root = process.cwd(), mode) {
  const path = normalizeRelativePath(value, "manifest path");
  if (!/^deploy\/manifests\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(path)) {
    throw new Error("Manifest path must be a JSON file under deploy/manifests/");
  }
  if (mode === "deploy" && path.startsWith("deploy/manifests/examples/")) {
    throw new Error("Example manifests are dry-run only; copy the reviewed manifest under deploy/manifests/releases/");
  }
  const absolute = resolve(root, path);
  const absoluteRoot = resolve(root);
  if (!absolute.startsWith(`${absoluteRoot}${sep}`)) throw new Error("Manifest path escapes repository");
  const details = await lstat(absolute).catch(() => null);
  if (!details?.isFile() || details.isSymbolicLink()) throw new Error("Manifest path must be an existing regular file, not a symlink");
  const resolvedPath = await realpath(absolute);
  if (!resolvedPath.startsWith(`${absoluteRoot}${sep}`)) throw new Error("Manifest symlink escapes repository");
  return resolvedPath;
}

export async function loadRelease(path) {
  let release;
  try { release = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { throw new Error(`Release metadata is not valid JSON: ${error.message}`); }
  if (!release || typeof release !== "object" || Array.isArray(release)) throw new Error("Release metadata must be an object");
  assertNoUnknownKeys(release, RELEASE_KEYS, "release");
  if (!Array.isArray(release.files)) throw new Error("release.files must be an array");
  for (let index = 0; index < release.files.length; index += 1) {
    assertNoUnknownKeys(release.files[index], RELEASE_FILE_KEYS, `release.files[${index}]`);
  }
  const manifestShape = {
    schemaVersion: release.schemaVersion,
    deploymentType: release.deploymentType,
    releaseType: release.releaseType,
    previousReleaseGeneration: release.previousReleaseGeneration,
    exampleOnly: release.exampleOnly,
    description: release.description,
    protectedPathsApproved: release.protectedPathsApproved,
    files: release.files.map(({ newSha256, size, packagedPath, ...file }) => file),
    validation: release.validation,
  };
  await validateManifestObject(manifestShape, { requireSources: false });
  if (typeof release.createdAt !== "string" || !Number.isFinite(Date.parse(release.createdAt))) throw new Error("release.createdAt is invalid");
  if (release.sourceCommit !== null && release.sourceCommit !== undefined && !/^[a-f0-9]{40}$/.test(release.sourceCommit)) {
    throw new Error("release.sourceCommit must be a full lowercase Git commit SHA");
  }
  if (release.expectedReleaseGeneration !== undefined) {
    if (release.deploymentType !== "backend" || !SHA256_PATTERN.test(release.expectedReleaseGeneration)) {
      throw new Error("release.expectedReleaseGeneration must be a backend runtime SHA-256");
    }
    if (release.expectedReleaseGeneration === release.previousReleaseGeneration) {
      throw new Error("Expected runtime generation must differ from the previous generation");
    }
  }
  if (typeof release.validatedOutputInventorySha256 !== "string" || !SHA256_PATTERN.test(release.validatedOutputInventorySha256)) {
    throw new Error("release.validatedOutputInventorySha256 must be a lowercase SHA-256");
  }
  if (!Array.isArray(release.sourceValidation) || release.sourceValidation.length !== release.files.length) {
    throw new Error("release.sourceValidation must record every packaged file");
  }
  for (let index = 0; index < release.sourceValidation.length; index += 1) {
    const record = release.sourceValidation[index];
    if (!record || record.source !== release.files[index].source || !["scanned-text", "approved-binary-asset"].includes(record.status)
      || record.sha256 !== release.files[index].newSha256 || record.size !== release.files[index].size) {
      throw new Error(`release.sourceValidation[${index}] is invalid`);
    }
  }
  const releaseRoot = resolve(path, "..");
  const inventoryContent = await readFile(resolve(releaseRoot, "validated-output-inventory.json")).catch(() => null);
  if (!inventoryContent || sha256(inventoryContent) !== release.validatedOutputInventorySha256) {
    throw new Error("Validated output inventory integrity check failed");
  }
  for (let index = 0; index < release.files.length; index += 1) {
    const file = release.files[index];
    if (!SHA256_PATTERN.test(file.newSha256)) throw new Error(`release.files[${index}].newSha256 is invalid`);
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`release.files[${index}].size is invalid`);
    const packagedPath = normalizeRelativePath(file.packagedPath, `release.files[${index}].packagedPath`);
    if (!/^files\/[0-9]{4}-[^/]+$/.test(packagedPath)) throw new Error(`release.files[${index}].packagedPath is invalid`);
    const absolutePackagedPath = resolve(releaseRoot, packagedPath);
    if (!absolutePackagedPath.startsWith(`${releaseRoot}${sep}`)) throw new Error(`Packaged file escapes release: ${packagedPath}`);
    const content = await readFile(absolutePackagedPath).catch(() => null);
    if (!content) throw new Error(`Packaged file is missing: ${packagedPath}`);
    if (content.byteLength !== file.size || sha256(content) !== file.newSha256) throw new Error(`Packaged file integrity check failed: ${packagedPath}`);
    file.absolutePackagedPath = absolutePackagedPath;
  }
  return release;
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function publicManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    deploymentType: manifest.deploymentType,
    releaseType: manifest.releaseType,
    previousReleaseGeneration: manifest.previousReleaseGeneration,
    exampleOnly: manifest.exampleOnly,
    description: manifest.description,
    protectedPathsApproved: manifest.protectedPathsApproved,
    files: manifest.files.map(({ absoluteSource, ...file }) => file),
    validation: manifest.validation,
  };
}

export function validationCommandsForRelease(releaseType) {
  if (!RELEASE_LEVELS.includes(releaseType)) throw new Error(`Unknown release level: ${releaseType}`);
  const commands = ["deployment-tooling-tests", "targeted-tests"];
  if (releaseType === "standard" || releaseType === "major") commands.push("representative-regression", "site-and-cpanel-build", "responsive-browser-and-api-verification", "transfer-size-comparison");
  if (releaseType === "major") commands.push("dependency-security-audit", "full-production-acceptance");
  return commands;
}
