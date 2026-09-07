// Server-only Web Crypto helpers. Never import this module from browser code.
export class StravaError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const encoder = new TextEncoder();

function encodeBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function randomSecret() {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashSecret(value) {
  return encodeBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function secretEquals(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length > 4096 || right.length > 4096) return false;
  const a = await hashSecret(left);
  const b = await hashSecret(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function requiredSecret(env, name, minLength = 1) {
  const value = env?.[name];
  if (typeof value !== "string" || value.trim().length < minLength || value.length > 4096) {
    throw new StravaError("strava_not_configured");
  }
  return value;
}

export async function tokenEncryptionKey(env) {
  try {
    const source = requiredSecret(env, "STRAVA_TOKEN_ENCRYPTION_KEY");
    if (!/^[A-Za-z0-9+/]{43}=$/.test(source)) throw new Error();
    const bytes = decodeBase64(source);
    if (bytes.length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new StravaError("strava_not_configured");
  }
}

export async function encryptTokens(key, athleteId, tokens) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({
    name: "AES-GCM", iv, additionalData: encoder.encode(`strava:${athleteId}:v1`),
  }, key, encoder.encode(JSON.stringify(tokens)));
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(data))}`;
}

export async function decryptTokens(key, athleteId, encrypted) {
  try {
    const [version, iv, data, extra] = encrypted.split(".");
    if (version !== "v1" || extra !== undefined) throw new Error();
    const bytes = await crypto.subtle.decrypt({
      name: "AES-GCM", iv: decodeBase64(iv), additionalData: encoder.encode(`strava:${athleteId}:v1`),
    }, key, decodeBase64(data));
    const tokens = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") throw new Error();
    return tokens;
  } catch {
    throw new StravaError("strava_credentials_unavailable");
  }
}
