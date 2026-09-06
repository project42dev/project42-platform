import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// A dated deferral that nobody re-checks is just a permanent exception with a
// comment. Trivy honours `expired_at` when it runs, but the scan lives in the
// 25-minute secure-self-host job and only fires when someone pushes. This test
// runs in the ordinary suite and, on a schedule, on its own - so the date
// alone is enough to turn the repository red.
const ignoreFilePath = fileURLToPath(
  new URL("../self-host/.trivyignore.yaml", import.meta.url),
);

function parseEntries(text) {
  const entries = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const idMatch = /^\s*-\s*id:\s*(\S+)\s*$/.exec(line);
    if (idMatch) {
      if (current) entries.push(current);
      current = { id: idMatch[1], expiresOn: null };
      continue;
    }
    const expiryMatch = /^\s*expired_at:\s*(\S+)\s*$/.exec(line);
    if (expiryMatch && current) {
      current.expiresOn = expiryMatch[1].replace(/^["']|["']$/g, "");
    }
  }
  if (current) entries.push(current);
  return entries;
}

test("every scanner deferral carries a date that has not passed", async () => {
  const text = await readFile(ignoreFilePath, "utf8");
  const entries = parseEntries(text);
  assert.ok(
    entries.length > 0,
    "self-host/.trivyignore.yaml declares no entries; if the exceptions were " +
      "cleared, delete this expectation deliberately rather than leaving a " +
      "check that can never fail.",
  );

  const today = new Date().toISOString().slice(0, 10);
  for (const entry of entries) {
    assert.ok(
      typeof entry.expiresOn === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn),
      `Scanner exception ${entry.id} must carry an ISO expired_at date. An ` +
        "exception without an expiry is permanent, which the file's own rules forbid.",
    );
    assert.ok(
      entry.expiresOn >= today,
      `Scanner exception ${entry.id} expired on ${entry.expiresOn}. Either pin ` +
        "the image forward to a release that fixes the finding and delete the " +
        "entry, or re-verify that the finding is still unreachable in this " +
        "topology and renew the entry with a new date and fresh evidence. Do " +
        "not extend the date to make CI green.",
    );
  }
});
