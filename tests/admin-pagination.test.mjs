import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CURSOR_MAX_LENGTH,
  ADMIN_PAGE_DEFAULT_SIZE,
  ADMIN_PAGE_MAX_SIZE,
  InvalidAdminCursorError,
  InvalidAdminPageSizeError,
  decodeAccountAdminCursor,
  decodeAuditAdminCursor,
  encodeAccountAdminCursor,
  encodeAuditAdminCursor,
  readAdminCursorEncryptionKey,
  validateAdminPageSize,
} from "../dist/admin-pagination.js";

const cursorKeyA = await readAdminCursorEncryptionKey(
  Buffer.alloc(32, 0x41).toString("base64url"),
);
const cursorKeyAReplica = await readAdminCursorEncryptionKey(
  Buffer.alloc(32, 0x41).toString("base64url"),
);
const cursorKeyB = await readAdminCursorEncryptionKey(
  Buffer.alloc(32, 0x42).toString("base64url"),
);

function alter(value) {
  const replacement = value[0] === "A" ? "B" : "A";
  return replacement + value.slice(1);
}

test("administration pagination publishes bounded defaults", () => {
  assert.equal(ADMIN_PAGE_DEFAULT_SIZE, 50);
  assert.equal(ADMIN_PAGE_MAX_SIZE, 100);
  assert.equal(ADMIN_CURSOR_MAX_LENGTH, 2_048);
  assert.equal(validateAdminPageSize(1), 1);
  assert.equal(validateAdminPageSize(100), 100);
  for (const invalid of [0, 101, 1.5, Number.NaN]) {
    assert.throws(
      () => validateAdminPageSize(invalid),
      InvalidAdminPageSizeError,
    );
  }
});

test("account cursors are opaque, authenticated, and bind tenant and filter", async () => {
  const input = {
    installationId: "installation-a",
    state: "pending",
    position: {
      createdAt: "2026-07-29T06:00:00.000Z",
      userId: "user-42",
    },
  };
  const first = await encodeAccountAdminCursor(input, cursorKeyA);
  const second = await encodeAccountAdminCursor(input, cursorKeyA);
  assert.notEqual(first, second);
  for (const segment of first.split(".")) {
    const decoded = Buffer.from(segment, "base64url").toString("utf8");
    assert.doesNotMatch(decoded, /installation-a|pending|user-42|2026-07-29/);
  }
  assert.deepEqual(
    await decodeAccountAdminCursor(
      first,
      {
        installationId: "installation-a",
        state: "pending",
      },
      cursorKeyAReplica,
    ),
    input.position,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        first,
        {
          installationId: "installation-b",
          state: "pending",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        first,
        {
          installationId: "installation-a",
          state: "approved",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        alter(first),
        {
          installationId: "installation-a",
          state: "pending",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        first,
        {
          installationId: "installation-a",
          state: "pending",
        },
        cursorKeyB,
      ),
    InvalidAdminCursorError,
  );
});

test("audit cursors reject alteration, cross-tenant reuse, and cursor-kind reuse", async () => {
  const cursor = await encodeAuditAdminCursor(
    {
      installationId: "installation-a",
      position: { sequence: "9007199254740993" },
    },
    cursorKeyA,
  );
  assert.deepEqual(
    await decodeAuditAdminCursor(
      cursor,
      {
        installationId: "installation-a",
      },
      cursorKeyA,
    ),
    { sequence: "9007199254740993" },
  );
  await assert.rejects(
    () =>
      decodeAuditAdminCursor(
        alter(cursor),
        {
          installationId: "installation-a",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAuditAdminCursor(
        cursor,
        {
          installationId: "installation-b",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        cursor,
        {
          installationId: "installation-a",
        },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
});

test("legacy public-digest cursors fail closed", async () => {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      v: 1,
      k: "accounts",
      i: "installation-a",
      f: "*",
      c: "2026-07-29T06:00:00.000Z",
      u: "user-42",
    }),
  ).toString("base64url");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `project42-admin-cursor-v1\0${encodedPayload}`,
    ),
  );
  const legacyCursor = `${encodedPayload}.${Buffer.from(digest).toString(
    "base64url",
  )}`;
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(
        legacyCursor,
        { installationId: "installation-a" },
        cursorKeyA,
      ),
    InvalidAdminCursorError,
  );
});

test("administration cursor keys reject malformed or short roots", () => {
  assert.throws(
    () => readAdminCursorEncryptionKey("not+base64url"),
    /base64url-encoded 32-byte/,
  );
  assert.throws(
    () =>
      readAdminCursorEncryptionKey(
        Buffer.alloc(31, 0x41).toString("base64url"),
      ),
    /base64url-encoded 32-byte/,
  );
});
