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
  validateAdminPageSize,
} from "../dist/admin-pagination.js";

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

test("account cursors round-trip deterministically and bind tenant and filter", async () => {
  const input = {
    installationId: "installation-a",
    state: "pending",
    position: {
      createdAt: "2026-07-29T06:00:00.000Z",
      userId: "user-42",
    },
  };
  const first = await encodeAccountAdminCursor(input);
  const second = await encodeAccountAdminCursor(input);
  assert.equal(first, second);
  assert.deepEqual(
    await decodeAccountAdminCursor(first, {
      installationId: "installation-a",
      state: "pending",
    }),
    input.position,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(first, {
        installationId: "installation-b",
        state: "pending",
      }),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(first, {
        installationId: "installation-a",
        state: "approved",
      }),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(alter(first), {
        installationId: "installation-a",
        state: "pending",
      }),
    InvalidAdminCursorError,
  );
});

test("audit cursors reject alteration, cross-tenant reuse, and cursor-kind reuse", async () => {
  const cursor = await encodeAuditAdminCursor({
    installationId: "installation-a",
    position: { sequence: "9007199254740993" },
  });
  assert.deepEqual(
    await decodeAuditAdminCursor(cursor, {
      installationId: "installation-a",
    }),
    { sequence: "9007199254740993" },
  );
  await assert.rejects(
    () =>
      decodeAuditAdminCursor(alter(cursor), {
        installationId: "installation-a",
      }),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAuditAdminCursor(cursor, {
        installationId: "installation-b",
      }),
    InvalidAdminCursorError,
  );
  await assert.rejects(
    () =>
      decodeAccountAdminCursor(cursor, {
        installationId: "installation-a",
      }),
    InvalidAdminCursorError,
  );
});
