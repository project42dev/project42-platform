// The header's three-state rule.
//
// The defect this guards against: the portal header rendered a "Sign in"
// button for every auth status that was not exactly "signed-in", so a reader
// whose account read was still in flight -- or had failed -- was told they
// were signed out. The session lives in an HttpOnly cookie that no script can
// read, so the front end genuinely cannot know, and must not guess. Guessing
// "signed out" is what made the owner sign in again on every visit.

import assert from "node:assert/strict";
import test from "node:test";
import {
  headerAccountName,
  headerAccountPresentation,
  headerOffersRetry,
  headerOffersSignIn,
} from "../web/app/lib/headerAccountPresentation.ts";

const account = {
  displayName: "Ada Lovelace",
  primaryEmail: "ada@example.test",
};

test("a loaded account is the only thing that renders as signed in", () => {
  assert.equal(headerAccountPresentation("signed-in", account), "signed-in");
  assert.equal(headerAccountName("signed-in", account), "Ada Lovelace");
  assert.equal(headerOffersSignIn("signed-in", account), false);
  assert.equal(headerOffersRetry("signed-in", account), false);
});

test("a settled answer of no session renders as signed out", () => {
  for (const status of ["signed-out", "unavailable"]) {
    assert.equal(headerAccountPresentation(status, null), "signed-out", status);
    assert.equal(headerAccountName(status, null), null, status);
    assert.equal(headerOffersSignIn(status, null), true, status);
    assert.equal(headerOffersRetry(status, null), false, status);
  }
});

test("an unresolved or failed account read is unknown, never signed out", () => {
  for (const status of ["loading", "signing-in", "error"]) {
    assert.equal(headerAccountPresentation(status, null), "unknown", status);
    // The header must claim neither thing.
    assert.equal(headerAccountName(status, null), null, status);
    assert.equal(headerOffersSignIn(status, null), false, status);
  }
});

test("a failed account read offers a retry rather than a sign-in", () => {
  assert.equal(headerAccountPresentation("error", null), "unknown");
  assert.equal(headerOffersSignIn("error", null), false);
  assert.equal(headerOffersRetry("error", null), true);
  // An in-flight read resolves itself; a retry button beside it is noise.
  assert.equal(headerOffersRetry("loading", null), false);
});

test("a failed read does not downgrade an account the header already had", () => {
  // AuthProvider drops the account object when the read fails. Whatever it
  // does, "error" must never present as signed out, because the HttpOnly
  // session cookie is untouched by a failed read and the reader is very
  // probably still signed in.
  assert.equal(headerAccountPresentation("error", account), "unknown");
  assert.equal(headerOffersSignIn("error", account), false);
});

test("signed-in with no account body resolves to unknown, not signed out", () => {
  assert.equal(headerAccountPresentation("signed-in", null), "unknown");
  assert.equal(headerOffersSignIn("signed-in", null), false);
});

test("the name falls back to the email and never renders blank", () => {
  assert.equal(
    headerAccountName("signed-in", { displayName: null, primaryEmail: "ada@example.test" }),
    "ada@example.test",
  );
  assert.equal(
    headerAccountName("signed-in", { displayName: "   ", primaryEmail: null }),
    null,
  );
  assert.equal(headerAccountName("signed-in", { displayName: null, primaryEmail: null }), null);
});

test("an unrecognised status fails to unknown rather than to signed out", () => {
  assert.equal(headerAccountPresentation("something-new", null), "unknown");
  assert.equal(headerOffersSignIn("something-new", null), false);
});
