const UNSAFE_ARTIFACT_PATTERNS = [
  ["recursive forced removal", /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i],
  ["recursive PowerShell removal", /\bRemove-Item\b[^\n]*\b-Recurse\b/i],
  ["destructive Git reset", /\bgit\s+reset\s+--hard\b/i],
  ["forced Git clean", /\bgit\s+clean\s+-[A-Za-z]*[fF][A-Za-z]*/],
  [
    "download piped to a shell",
    /\b(?:curl|wget)\b[^;\r\n]{0,500}\|(?:[^;\r\n|]{0,200}\|)*\s*(?:ba)?sh\b/i,
  ],
  ["PowerShell expression execution", /\b(?:Invoke-Expression|iex)\b/i],
];

const RECOVERY_ANCHOR_PATTERN = /\b(?:rollback|recovery)\b/i;

export function findUnsafeArtifactCommands(resource) {
  const artifactText = normalizeShellLayout(
    resource.sections
      .map((section) => section.code?.code ?? "")
      .filter(Boolean)
      .join("\n"),
  );
  return UNSAFE_ARTIFACT_PATTERNS.filter(([, pattern]) =>
    pattern.test(artifactText),
  ).map(([name]) => name);
}

export function hasVerificationGuidance(resource) {
  const acceptance = resource.sections.find((section) =>
    /^Expected (result|evidence) and verification$/i.test(section.title),
  );
  if (!acceptance) return false;
  return /\bverif(?:y|ication|ied)\b/i.test(
    [acceptance.title, ...acceptance.paragraphs].join("\n"),
  );
}

export function hasRecoveryGuidance(resource) {
  return resource.sections.some((section) =>
    RECOVERY_ANCHOR_PATTERN.test(
      [
        section.title,
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ].join("\n"),
    ),
  );
}

export function normalizeRequiredArtifactFields(value) {
  const fields = value ?? [];
  const valid =
    Array.isArray(fields) &&
    !fields.some(
      (field) => typeof field !== "string" || field.trim().length === 0,
    ) &&
    new Set(fields).size === fields.length;
  return { valid, fields: valid ? fields : [] };
}

export function findMissingArtifactFields(resource, requiredFields) {
  const artifactText = resource.sections
    .map((section) => section.code?.code ?? "")
    .join("\n");
  return requiredFields.filter((field) => !artifactText.includes(field));
}

function normalizeShellLayout(value) {
  return value
    .replace(/\\\r?\n/g, " ")
    .replace(/\|\s*\r?\n\s*/g, " | ")
    .replace(/\r?\n\s*\|/g, " | ");
}
