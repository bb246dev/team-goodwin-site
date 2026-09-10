import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { normalizeRelativePath } from "./lib.mjs";

function curlConfigEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r", "").replaceAll("\n", "");
}

function validateFtpsEnvironment(env) {
  const host = env.NAMECHEAP_FTPS_HOST;
  const username = env.NAMECHEAP_FTPS_USERNAME;
  const password = env.NAMECHEAP_FTPS_PASSWORD;
  const port = env.NAMECHEAP_FTPS_PORT || "21";
  if (!host || !/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(host)) throw new Error("NAMECHEAP_FTPS_HOST is missing or invalid");
  if (!username || /[:\r\n\0]/.test(username)) throw new Error("NAMECHEAP_FTPS_USERNAME is missing or invalid");
  if (!password || /[\r\n\0]/.test(password)) throw new Error("NAMECHEAP_FTPS_PASSWORD is missing or invalid");
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("NAMECHEAP_FTPS_PORT is invalid");
  const basePath = env.NAMECHEAP_FTPS_BASE_PATH ? normalizeRelativePath(env.NAMECHEAP_FTPS_BASE_PATH.replace(/^\/+|\/+$/g, ""), "NAMECHEAP_FTPS_BASE_PATH") : "";
  const temporaryRoot = env.DEPLOY_TEMP_ROOT ? resolve(env.DEPLOY_TEMP_ROOT) : tmpdir();
  return { host, username, password, port, basePath, temporaryRoot, manageTemporaryRoot: Boolean(env.DEPLOY_TEMP_ROOT) };
}

function remoteUrl(configuration, destination) {
  const remotePath = [configuration.basePath, normalizeRelativePath(destination, "remote destination")]
    .filter(Boolean)
    .flatMap((part) => part.split("/"))
    .map(encodeURIComponent)
    .join("/");
  return `ftp://${configuration.host}:${configuration.port}/${remotePath}`;
}

async function runCurl(configuration, extraArguments) {
  if (configuration.manageTemporaryRoot) {
    await mkdir(configuration.temporaryRoot, { recursive: true, mode: 0o700 });
    await chmod(configuration.temporaryRoot, 0o700);
  }
  const temporaryDirectory = await mkdtemp(join(configuration.temporaryRoot, "goodwin-ftps-"));
  const configPath = join(temporaryDirectory, "curl.conf");
  const config = [
    `user = "${curlConfigEscape(`${configuration.username}:${configuration.password}`)}"`,
    "silent",
    "show-error",
    "ssl-reqd",
    "tlsv1.2",
    "ftp-method = singlecwd",
    "connect-timeout = 20",
    "max-time = 180",
    "retry = 3",
    "retry-delay = 3",
    "retry-all-errors",
  ].join("\n");
  await writeFile(configPath, `${config}\n`, { mode: 0o600, flag: "wx" });
  await chmod(configPath, 0o600);
  try {
    return await new Promise((resolvePromise, reject) => {
      const child = spawn("curl", ["--config", configPath, ...extraArguments], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (status) => resolvePromise({ status, stdout, stderr }));
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function rejectAmbiguousFtpsAbsence(destination) {
  throw new Error(`FTPS cannot prove destination absence unambiguously for ${destination}; new remote files require a separate reviewed provisioning step`);
}

export function createFtpsClient(env = process.env) {
  const configuration = validateFtpsEnvironment(env);
  return {
    async download(destination, localPath, { allowMissing = false } = {}) {
      await mkdir(dirname(localPath), { recursive: true });
      const result = await runCurl(configuration, ["--fail", "--output", localPath, remoteUrl(configuration, destination)]);
      if (result.status === 0) return { exists: true };
      if (allowMissing) {
        await rm(localPath, { force: true });
        return rejectAmbiguousFtpsAbsence(destination);
      }
      throw new Error(`FTPS download failed for ${destination} (curl ${result.status}): ${result.stderr.trim() || "no diagnostic"}`);
    },
    async upload(localPath, destination) {
      const result = await runCurl(configuration, ["--fail", "--upload-file", localPath, remoteUrl(configuration, destination)]);
      if (result.status !== 0) throw new Error(`FTPS upload failed for ${destination} (curl ${result.status}): ${result.stderr.trim() || "no diagnostic"}`);
    },
  };
}

export function createLocalProductionClient(root, allowLocalTestAdapter) {
  if (!allowLocalTestAdapter) throw new Error("Local production adapter requires --allow-local-test-adapter");
  const localRoot = resolve(root);
  function target(destination) {
    const safe = normalizeRelativePath(destination, "local remote destination");
    const value = resolve(localRoot, safe);
    if (!value.startsWith(`${localRoot}${sep}`)) throw new Error("Local adapter destination escapes root");
    return value;
  }
  return {
    async download(destination, localPath, { allowMissing = false } = {}) {
      const source = target(destination);
      const details = await stat(source).catch(() => null);
      if (!details?.isFile()) {
        if (allowMissing) return { exists: false };
        throw new Error(`Local production file is missing: ${destination}`);
      }
      await mkdir(dirname(localPath), { recursive: true });
      await copyFile(source, localPath);
      return { exists: true };
    },
    async upload(localPath, destination) {
      const output = target(destination);
      await mkdir(dirname(output), { recursive: true });
      await copyFile(localPath, output);
    },
  };
}

export function productionClient(args, env = process.env) {
  if (args["local-production-root"]) return createLocalProductionClient(args["local-production-root"], args["allow-local-test-adapter"] === true);
  return createFtpsClient(env);
}
