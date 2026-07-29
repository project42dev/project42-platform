const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const OIDC_TRANSACTION_COOKIE = "__Host-project42_oidc" as const;
export const BROWSER_SESSION_COOKIE = "__Host-project42_session" as const;

export interface BrowserOidcConfiguration {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  logoutEndpoint: string | null;
  encryptionKey: CryptoKey;
}

export interface BrowserOidcTransaction {
  id: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: string;
}

export interface BrowserSessionEnvironment {
  OIDC_AUTHORIZATION_ENDPOINT?: string;
  OIDC_TOKEN_ENDPOINT?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_LOGOUT_ENDPOINT?: string;
  SESSION_ENCRYPTION_KEY?: string;
}

export async function readBrowserOidcConfiguration(
  env: BrowserSessionEnvironment,
): Promise<BrowserOidcConfiguration> {
  const authorizationEndpoint = strictHttpsUrl(
    env.OIDC_AUTHORIZATION_ENDPOINT,
    "OIDC_AUTHORIZATION_ENDPOINT",
  );
  const tokenEndpoint = strictHttpsUrl(
    env.OIDC_TOKEN_ENDPOINT,
    "OIDC_TOKEN_ENDPOINT",
  );
  const redirectUri = strictHttpsUrl(
    env.OIDC_REDIRECT_URI,
    "OIDC_REDIRECT_URI",
  );
  const clientId = requiredValue(env.OIDC_CLIENT_ID, "OIDC_CLIENT_ID");
  const encodedKey = requiredValue(
    env.SESSION_ENCRYPTION_KEY,
    "SESSION_ENCRYPTION_KEY",
  );
  const keyBytes = decodeBase64Url(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.",
    );
  }
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  return {
    authorizationEndpoint,
    tokenEndpoint,
    clientId,
    clientSecret: env.OIDC_CLIENT_SECRET?.trim() || null,
    redirectUri,
    logoutEndpoint: env.OIDC_LOGOUT_ENDPOINT
      ? strictHttpsUrl(env.OIDC_LOGOUT_ENDPOINT, "OIDC_LOGOUT_ENDPOINT")
      : null,
    encryptionKey,
  };
}

export function randomBase64Url(byteLength = 32): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 128) {
    throw new Error("Random value length must be between 16 and 128 bytes.");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  return encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  if (verifier.length < 43 || verifier.length > 128) {
    throw new Error("PKCE verifier length is invalid.");
  }
  return sha256Base64Url(verifier);
}

export async function sealOidcTransaction(
  transaction: BrowserOidcTransaction,
  key: CryptoKey,
): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode("project42-oidc-v1") },
    key,
    encoder.encode(JSON.stringify(transaction)),
  );
  return `${encodeBase64Url(iv)}.${encodeBase64Url(
    new Uint8Array(ciphertext),
  )}`;
}

export async function openOidcTransaction(
  value: string,
  key: CryptoKey,
): Promise<BrowserOidcTransaction> {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("OIDC transaction cookie is invalid.");
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64Url(parts[0] ?? ""),
        additionalData: encoder.encode("project42-oidc-v1"),
      },
      key,
      decodeBase64Url(parts[1] ?? ""),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as Record<
      string,
      unknown
    >;
    const transaction: BrowserOidcTransaction = {
      id: requiredParsedString(parsed.id, "transaction id"),
      state: requiredParsedString(parsed.state, "state"),
      nonce: requiredParsedString(parsed.nonce, "nonce"),
      codeVerifier: requiredParsedString(
        parsed.codeVerifier,
        "code verifier",
      ),
      returnTo: requiredParsedString(parsed.returnTo, "return target"),
      expiresAt: requiredParsedString(parsed.expiresAt, "expiry"),
    };
    if (
      transaction.state.length < 32 ||
      transaction.nonce.length < 32 ||
      transaction.codeVerifier.length < 43
    ) {
      throw new Error("OIDC transaction cookie is incomplete.");
    }
    if (
      !Number.isFinite(Date.parse(transaction.expiresAt)) ||
      Date.parse(transaction.expiresAt) <= Date.now()
    ) {
      throw new Error("OIDC transaction has expired.");
    }
    return transaction;
  } catch {
    throw new Error("OIDC transaction cookie is invalid or expired.");
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export function createHostCookie(
  name: string,
  value: string,
  maximumAgeSeconds: number,
): string {
  if (!name.startsWith("__Host-")) {
    throw new Error("Browser security cookies must use the __Host- prefix.");
  }
  if (
    !Number.isSafeInteger(maximumAgeSeconds) ||
    maximumAgeSeconds < 0 ||
    maximumAgeSeconds > 2_592_000
  ) {
    throw new Error("Cookie lifetime is invalid.");
  }
  return `${name}=${value}; Path=/; Max-Age=${maximumAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearHostCookie(name: string): string {
  return createHostCookie(name, "", 0);
}

export function normalizeReturnTarget(
  candidate: string | null,
  allowedOrigins: string,
): string {
  const origins = allowedOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
  if (origins.length === 0) {
    throw new Error("At least one allowed browser origin is required.");
  }
  const fallback = new URL("/account/", `${origins[0]}/`).toString();
  if (!candidate) return fallback;
  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    return fallback;
  }
  if (
    !origins.includes(target.origin) ||
    target.username ||
    target.password ||
    target.hash
  ) {
    return fallback;
  }
  return target.toString();
}

function strictHttpsUrl(value: string | undefined, name: string): string {
  const normalized = requiredValue(value, name);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials or a fragment.`);
  }
  return url.toString();
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized || /^<.+>$/.test(normalized)) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function requiredParsedString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`OIDC ${name} is missing.`);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Base64url value is invalid.");
  }
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
