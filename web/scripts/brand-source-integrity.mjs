import { createHash } from "node:crypto";

export function canonicalizeSvgSource(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return Buffer.from(text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), "utf8");
}

export function sourceSha256(value) {
  return createHash("sha256")
    .update(canonicalizeSvgSource(value))
    .digest("hex");
}
