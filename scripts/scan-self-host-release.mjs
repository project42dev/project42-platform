import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";

const roots = ["self-host", "docs/self-hosting"];
const textExtensions = new Set([
  "",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".sh",
  ".sql",
  ".txt",
  ".yaml",
  ".yml",
]);
const findings = [];

for (const root of roots) {
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = `${entry.parentPath}/${entry.name}`.replaceAll("\\", "/");
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    const text = await readFile(path, "utf8");
    inspect(path, text);
  }
}

const secureCompose = await readFile("self-host/compose.https.yaml", "utf8");
for (const variable of [
  "PROJECT42_DATABASE_PASSWORD",
  "PROJECT42_IDENTITY_ADMIN_PASSWORD",
  "PROJECT42_SESSION_ENCRYPTION_KEY",
]) {
  if (!secureCompose.includes(`\${${variable}:?`)) {
    findings.push(
      `self-host/compose.https.yaml: ${variable} must be supplied by required interpolation.`,
    );
  }
}
if (
  (secureCompose.match(/^\s+ports:\s*$/gm) ?? []).length !== 1 ||
  !secureCompose.includes('- "443:443"')
) {
  findings.push(
    "self-host/compose.https.yaml: only the gateway TCP 443 mapping may be published.",
  );
}
if (
  (secureCompose.match(/^\s+cap_add:\s*$/gm) ?? []).length !== 2 ||
  !secureCompose.includes("      - SYS_CHROOT") ||
  !secureCompose.includes("      - DAC_READ_SEARCH") ||
  /\bSYS_ADMIN\b/.test(secureCompose)
) {
  findings.push(
    "self-host/compose.https.yaml: capability additions must remain limited to browser SYS_CHROOT and recovery DAC_READ_SEARCH.",
  );
}

if (findings.length > 0) {
  throw new Error(
    `Self-host release security scan failed:\n${findings
      .map((finding) => `- ${finding}`)
      .join("\n")}`,
  );
}

console.log(
  "Validated self-host secret interpolation, TLS policy, container boundaries, " +
    "and published-port policy.",
);

function inspect(path, text) {
  const checks = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key material"],
    [/\bgh[opsu]_[A-Za-z0-9]{30,}\b/, "GitHub token material"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access-key material"],
    [/\bNODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*["']?0\b/i, "disabled Node TLS"],
    [/\bignoreHTTPSErrors\s*:\s*true\b/i, "disabled browser TLS"],
    [/(?:^|\s)--insecure(?:\s|$)/m, "insecure TLS client option"],
    [/^\s*privileged:\s*true\s*$/im, "privileged container"],
    [/\bseccomp\s*=\s*unconfined\b/i, "unconfined seccomp"],
    [/\/var\/run\/docker\.sock/, "Docker daemon socket mount"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) {
      findings.push(`${relative(".", path)}: contains ${label}.`);
    }
  }

  if (/(?:^|\/)(?:\.?env[^/]*)$/i.test(path)) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const match = line.match(
        /^([A-Z0-9_]*(?:PASSWORD|SECRET|ENCRYPTION_KEY))=(.*)$/,
      );
      if (!match) continue;
      const value = match[2].trim();
      if (value && !value.startsWith("replace-")) {
        findings.push(
          `${relative(".", path)}:${index + 1}: contains a literal sensitive value.`,
        );
      }
    }
  }
}
