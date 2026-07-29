import type { AccountState } from "./identity.js";

export const ADMIN_PAGE_DEFAULT_SIZE = 50;
export const ADMIN_PAGE_MAX_SIZE = 100;
export const ADMIN_CURSOR_MAX_LENGTH = 2_048;

const CURSOR_VERSION = 1;
const CURSOR_DIGEST_DOMAIN = "project42-admin-cursor-v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

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

export interface AccountCursorPosition {
  createdAt: string;
  userId: string;
}

export interface AuditCursorPosition {
  sequence: string;
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

export async function encodeAccountAdminCursor(input: {
  installationId: string;
  state?: AccountState;
  position: AccountCursorPosition;
}): Promise<string> {
  return encodeCursor({
    v: CURSOR_VERSION,
    k: "accounts",
    i: input.installationId,
    f: input.state ?? "*",
    c: input.position.createdAt,
    u: input.position.userId,
  });
}

export async function decodeAccountAdminCursor(
  cursor: string,
  expected: {
    installationId: string;
    state?: AccountState;
  },
): Promise<AccountCursorPosition> {
  const payload = await decodeCursor(cursor);
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

export async function encodeAuditAdminCursor(input: {
  installationId: string;
  position: AuditCursorPosition;
}): Promise<string> {
  return encodeCursor({
    v: CURSOR_VERSION,
    k: "audit",
    i: input.installationId,
    f: "*",
    s: input.position.sequence,
  });
}

export async function decodeAuditAdminCursor(
  cursor: string,
  expected: { installationId: string },
): Promise<AuditCursorPosition> {
  const payload = await decodeCursor(cursor);
  if (
    !isAuditCursorPayload(payload) ||
    payload.i !== expected.installationId
  ) {
    throw new InvalidAdminCursorError();
  }
  return { sequence: payload.s };
}

async function encodeCursor(
  payload: AccountCursorPayload | AuditCursorPayload,
): Promise<string> {
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const digest = await cursorDigest(encodedPayload);
  return `${encodedPayload}.${toBase64Url(digest)}`;
}

async function decodeCursor(
  cursor: string,
): Promise<Record<string, unknown>> {
  if (
    cursor.length === 0 ||
    cursor.length > ADMIN_CURSOR_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw new InvalidAdminCursorError();
  }
  const [encodedPayload, encodedDigest] = cursor.split(".");
  if (!encodedPayload || !encodedDigest) {
    throw new InvalidAdminCursorError();
  }
  let receivedDigest: Uint8Array;
  let decoded: unknown;
  try {
    receivedDigest = fromBase64Url(encodedDigest);
    decoded = JSON.parse(textDecoder.decode(fromBase64Url(encodedPayload)));
  } catch {
    throw new InvalidAdminCursorError();
  }
  const expectedDigest = await cursorDigest(encodedPayload);
  if (!constantTimeEqual(receivedDigest, expectedDigest) || !isObject(decoded)) {
    throw new InvalidAdminCursorError();
  }
  return decoded;
}

async function cursorDigest(encodedPayload: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`${CURSOR_DIGEST_DOMAIN}\0${encodedPayload}`),
  );
  return new Uint8Array(digest);
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

function fromBase64Url(value: string): Uint8Array {
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
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
