import type { AccountState } from "./identity.js";

export const ADMIN_PAGE_DEFAULT_SIZE = 50;
export const ADMIN_PAGE_MAX_SIZE = 100;
export const ADMIN_CURSOR_MAX_LENGTH = 2_048;

const CURSOR_VERSION = 2;
const CURSOR_INITIALIZATION_VECTOR_BYTES = 12;
const CURSOR_ROOT_KEY_BYTES = 32;
const CURSOR_ADDITIONAL_DATA = "project42-admin-cursor-v2";
const CURSOR_KEY_DERIVATION_SALT = "project42-admin-cursor-key-v2";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
let processCursorKey: Promise<CryptoKey> | undefined;

interface AccountCursorPayload extends Record<string, unknown> {
  v: typeof CURSOR_VERSION;
  k: "accounts";
  i: string;
  f: AccountState | "*";
  c: string;
  u: string;
}

interface AuditCursorPayload extends Record<string, unknown> {
  v: typeof CURSOR_VERSION;
  k: "audit";
  i: string;
  f: "*";
  s: string;
}

interface DeletionCursorPayload extends Record<string, unknown> {
  v: typeof CURSOR_VERSION;
  k: "deletions";
  i: string;
  f: "*";
  r: string;
  d: string;
}

export interface AccountCursorPosition {
  createdAt: string;
  userId: string;
}

export interface AuditCursorPosition {
  sequence: string;
}

export interface DeletionCursorPosition {
  requestedAt: string;
  deletionRequestId: string;
}

export class InvalidAdminCursorError extends Error {
  constructor() {
    super("The administration cursor is invalid or does not match this query.");
    this.name = "InvalidAdminCursorError";
  }
}

export class InvalidAdminPageSizeError extends Error {
  constructor() {
    super(
      `Administration page size must be an integer between 1 and ${ADMIN_PAGE_MAX_SIZE}.`,
    );
    this.name = "InvalidAdminPageSizeError";
  }
}

export function validateAdminPageSize(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > ADMIN_PAGE_MAX_SIZE
  ) {
    throw new InvalidAdminPageSizeError();
  }
  return value;
}

export async function encodeAccountAdminCursor(
  input: {
    installationId: string;
    state?: AccountState;
    position: AccountCursorPosition;
  },
  encryptionKey: CryptoKey,
): Promise<string> {
  return encodeCursor(
    {
      v: CURSOR_VERSION,
      k: "accounts",
      i: input.installationId,
      f: input.state ?? "*",
      c: input.position.createdAt,
      u: input.position.userId,
    },
    encryptionKey,
  );
}

export async function decodeAccountAdminCursor(
  cursor: string,
  expected: {
    installationId: string;
    state?: AccountState;
  },
  encryptionKey: CryptoKey,
): Promise<AccountCursorPosition> {
  const payload = await decodeCursor(cursor, encryptionKey);
  if (
    !isAccountCursorPayload(payload) ||
    payload.i !== expected.installationId ||
    payload.f !== (expected.state ?? "*")
  ) {
    throw new InvalidAdminCursorError();
  }
  return {
    createdAt: payload.c,
    userId: payload.u,
  };
}

export async function encodeAuditAdminCursor(
  input: {
    installationId: string;
    position: AuditCursorPosition;
  },
  encryptionKey: CryptoKey,
): Promise<string> {
  return encodeCursor(
    {
      v: CURSOR_VERSION,
      k: "audit",
      i: input.installationId,
      f: "*",
      s: input.position.sequence,
    },
    encryptionKey,
  );
}

export async function decodeAuditAdminCursor(
  cursor: string,
  expected: { installationId: string },
  encryptionKey: CryptoKey,
): Promise<AuditCursorPosition> {
  const payload = await decodeCursor(cursor, encryptionKey);
  if (
    !isAuditCursorPayload(payload) ||
    payload.i !== expected.installationId
  ) {
    throw new InvalidAdminCursorError();
  }
  return { sequence: payload.s };
}

export async function encodeDeletionAdminCursor(
  input: {
    installationId: string;
    position: DeletionCursorPosition;
  },
  encryptionKey: CryptoKey,
): Promise<string> {
  return encodeCursor(
    {
      v: CURSOR_VERSION,
      k: "deletions",
      i: input.installationId,
      f: "*",
      r: input.position.requestedAt,
      d: input.position.deletionRequestId,
    },
    encryptionKey,
  );
}

export async function decodeDeletionAdminCursor(
  cursor: string,
  expected: { installationId: string },
  encryptionKey: CryptoKey,
): Promise<DeletionCursorPosition> {
  const payload = await decodeCursor(cursor, encryptionKey);
  if (
    !isDeletionCursorPayload(payload) ||
    payload.i !== expected.installationId
  ) {
    throw new InvalidAdminCursorError();
  }
  return {
    requestedAt: payload.r,
    deletionRequestId: payload.d,
  };
}

async function encodeCursor(
  payload: AccountCursorPayload | AuditCursorPayload | DeletionCursorPayload,
  encryptionKey: CryptoKey,
): Promise<string> {
  const initializationVector = new Uint8Array(
    CURSOR_INITIALIZATION_VECTOR_BYTES,
  );
  crypto.getRandomValues(initializationVector);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: initializationVector,
      additionalData: textEncoder.encode(CURSOR_ADDITIONAL_DATA),
    },
    encryptionKey,
    textEncoder.encode(JSON.stringify(payload)),
  );
  return `${toBase64Url(initializationVector)}.${toBase64Url(
    new Uint8Array(ciphertext),
  )}`;
}

async function decodeCursor(
  cursor: string,
  encryptionKey: CryptoKey,
): Promise<Record<string, unknown>> {
  if (
    cursor.length === 0 ||
    cursor.length > ADMIN_CURSOR_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw new InvalidAdminCursorError();
  }
  const [encodedInitializationVector, encodedCiphertext] = cursor.split(".");
  if (!encodedInitializationVector || !encodedCiphertext) {
    throw new InvalidAdminCursorError();
  }
  let decoded: unknown;
  try {
    const initializationVector = fromBase64Url(
      encodedInitializationVector,
    );
    const ciphertext = fromBase64Url(encodedCiphertext);
    if (
      initializationVector.byteLength !== CURSOR_INITIALIZATION_VECTOR_BYTES ||
      ciphertext.byteLength <= 16
    ) {
      throw new InvalidAdminCursorError();
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: initializationVector,
        additionalData: textEncoder.encode(CURSOR_ADDITIONAL_DATA),
      },
      encryptionKey,
      ciphertext,
    );
    decoded = JSON.parse(textDecoder.decode(plaintext));
  } catch {
    throw new InvalidAdminCursorError();
  }
  if (!isObject(decoded)) {
    throw new InvalidAdminCursorError();
  }
  return decoded;
}

export function readAdminCursorEncryptionKey(
  encodedRootKey?: string,
): Promise<CryptoKey> {
  const normalized = encodedRootKey?.trim();
  if (!normalized) {
    processCursorKey ??= deriveAdminCursorEncryptionKey(randomRootKey());
    return processCursorKey;
  }
  let rootKey: Uint8Array<ArrayBuffer>;
  try {
    rootKey = fromBase64Url(normalized);
  } catch {
    throw new Error(
      "The administration cursor key must be a base64url-encoded 32-byte value.",
    );
  }
  if (rootKey.byteLength !== CURSOR_ROOT_KEY_BYTES) {
    throw new Error(
      "The administration cursor key must be a base64url-encoded 32-byte value.",
    );
  }
  return deriveAdminCursorEncryptionKey(rootKey);
}

async function deriveAdminCursorEncryptionKey(
  rootKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rootKey,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: textEncoder.encode(CURSOR_KEY_DERIVATION_SALT),
      info: textEncoder.encode(CURSOR_ADDITIONAL_DATA),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomRootKey(): Uint8Array<ArrayBuffer> {
  const rootKey = new Uint8Array(CURSOR_ROOT_KEY_BYTES);
  crypto.getRandomValues(rootKey);
  return rootKey;
}

function isAccountCursorPayload(
  value: Record<string, unknown>,
): value is AccountCursorPayload {
  return (
    hasExactKeys(value, ["v", "k", "i", "f", "c", "u"]) &&
    value.v === CURSOR_VERSION &&
    value.k === "accounts" &&
    isBoundedString(value.i, 1, 256) &&
    (value.f === "*" ||
      value.f === "pending" ||
      value.f === "approved" ||
      value.f === "rejected" ||
      value.f === "suspended" ||
      value.f === "revoked") &&
    isBoundedString(value.c, 1, 64) &&
    Number.isFinite(Date.parse(value.c)) &&
    isBoundedString(value.u, 1, 256)
  );
}

function isAuditCursorPayload(
  value: Record<string, unknown>,
): value is AuditCursorPayload {
  return (
    hasExactKeys(value, ["v", "k", "i", "f", "s"]) &&
    value.v === CURSOR_VERSION &&
    value.k === "audit" &&
    isBoundedString(value.i, 1, 256) &&
    value.f === "*" &&
    typeof value.s === "string" &&
    /^[1-9]\d{0,18}$/.test(value.s)
  );
}

function isDeletionCursorPayload(
  value: Record<string, unknown>,
): value is DeletionCursorPayload {
  return (
    hasExactKeys(value, ["v", "k", "i", "f", "r", "d"]) &&
    value.v === CURSOR_VERSION &&
    value.k === "deletions" &&
    isBoundedString(value.i, 1, 256) &&
    value.f === "*" &&
    isBoundedString(value.r, 1, 64) &&
    Number.isFinite(Date.parse(value.r)) &&
    isBoundedString(value.d, 1, 256)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new InvalidAdminCursorError();
  }
  const remainder = value.length % 4;
  if (remainder === 1) throw new InvalidAdminCursorError();
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(value.length + ((4 - remainder) % 4), "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
