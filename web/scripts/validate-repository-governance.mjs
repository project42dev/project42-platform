import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_DOCUMENTS = {
  "CONTRIBUTING.md": [
    "Before you begin",
    "Local development",
    "Validation",
    "Pull requests",
    "Security",
  ],
  "SECURITY.md": [
    "Supported versions",
    "Reporting a vulnerability",
    "Response",
    "Disclosure",
  ],
  "SUPPORT.md": [
    "Supported surfaces",
    "Compatibility",
    "Deprecation",
    "Getting help",
  ],
};

const REQUIRED_README_LINKS = Object.keys(REQUIRED_DOCUMENTS);

const REQUIRED_CROSS_LINKS = {
  "CONTRIBUTING.md": ["SECURITY.md", "SUPPORT.md"],
  "SECURITY.md": ["CONTRIBUTING.md", "SUPPORT.md"],
  "SUPPORT.md": ["CONTRIBUTING.md", "SECURITY.md"],
};

const PRIVATE_MATERIAL_PATTERNS = [
  {
    label: "private Azure DevOps URL",
    pattern: /https?:\/\/(?:dev\.azure\.com|[a-z0-9.-]+\.visualstudio\.com)\//i,
  },
  {
    label: "private work-item reference",
    pattern: /\bAB#\d+\b/i,
  },
  {
    label: "private operations repository name",
    pattern: new RegExp("\\bproject42dev-" + "ops\\b", "i"),
  },
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "GUID-like identifier",
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  },
  {
    label: "local Windows path",
    pattern: /\b[A-Z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/i,
  },
  {
    label: "credential-like assignment",
    pattern:
      /\b(?:api[_-]?key|client[_-]?secret|account[_-]?key|password|token)\b["']?\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"'`]{8,})/i,
  },
  {
    label: "resource-identifier assignment",
    pattern:
      /\b(?:tenant|subscription|account|database|bucket|application)[_-]?id\b["']?\s*[:=]\s*(?:"[A-Za-z0-9_-]{8,}"|'[A-Za-z0-9_-]{8,}'|[A-Za-z0-9_-]{8,})/i,
  },
];

export function validateRepositoryGovernance(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const errors = [];
  const documents = new Map();

  const readmePath = path.join(root, "README.md");
  if (!fs.existsSync(readmePath)) {
    errors.push("README.md is missing.");
  } else {
    documents.set("README.md", fs.readFileSync(readmePath, "utf8"));
  }

  for (const [documentName, requiredHeadings] of Object.entries(
    REQUIRED_DOCUMENTS,
  )) {
    const documentPath = path.join(root, documentName);
    if (!fs.existsSync(documentPath)) {
      errors.push(`${documentName} is missing.`);
      continue;
    }

    const content = fs.readFileSync(documentPath, "utf8");
    documents.set(documentName, content);
    if (content.trim().length < 300) {
      errors.push(`${documentName} is empty or too short to be useful.`);
    }

    for (const heading of requiredHeadings) {
      if (!hasSecondLevelHeading(content, heading)) {
        errors.push(`${documentName} is missing the "${heading}" section.`);
      }
    }
  }

  for (const [documentName, content] of documents) {
    for (const { label, pattern } of PRIVATE_MATERIAL_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`${documentName} contains ${label}.`);
      }
    }
  }

  const readme = documents.get("README.md");
  if (readme) {
    for (const documentName of REQUIRED_README_LINKS) {
      if (!hasMarkdownLinkTarget(readme, documentName)) {
        errors.push(`README.md must link to ${documentName}.`);
      }
    }
  }

  for (const [documentName, targets] of Object.entries(REQUIRED_CROSS_LINKS)) {
    const content = documents.get(documentName);
    if (!content) continue;
    for (const target of targets) {
      if (!hasMarkdownLinkTarget(content, target)) {
        errors.push(`${documentName} must link to ${target}.`);
      }
    }
    validateRelativeMarkdownLinks({
      content,
      documentName,
      repositoryRoot: root,
      errors,
    });
  }

  return {
    documentCount: documents.size - (documents.has("README.md") ? 1 : 0),
    errors,
  };
}

export function assertRepositoryGovernance(repositoryRoot) {
  const result = validateRepositoryGovernance(repositoryRoot);
  if (result.errors.length > 0) {
    throw new Error(
      `Repository governance validation failed:\n${result.errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return result;
}

function hasSecondLevelHeading(content, expected) {
  return content
    .split(/\r?\n/u)
    .some((line) => line.trim().toLowerCase() === `## ${expected.toLowerCase()}`);
}

function hasMarkdownLinkTarget(content, expectedTarget) {
  const normalizedExpected = normalizeLinkTarget(expectedTarget);
  return extractMarkdownTargets(content).some(
    (target) => normalizeLinkTarget(target) === normalizedExpected,
  );
}

function extractMarkdownTargets(content) {
  return [...content.matchAll(/\[[^\]]+\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)]
    .map((match) => match.groups?.target ?? "")
    .filter(Boolean);
}

function normalizeLinkTarget(target) {
  const withoutFragment = target.split(/[?#]/u, 1)[0];
  return decodeURIComponent(withoutFragment)
    .replace(/^\.\//u, "")
    .replaceAll("\\", "/")
    .toLowerCase();
}

function validateRelativeMarkdownLinks({
  content,
  documentName,
  repositoryRoot,
  errors,
}) {
  for (const target of extractMarkdownTargets(content)) {
    if (
      target.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/iu.test(target)
    ) {
      continue;
    }

    const relativeTarget = target.split(/[?#]/u, 1)[0];
    const decodedTarget = decodeURIComponent(relativeTarget);
    const resolved = path.resolve(
      repositoryRoot,
      path.dirname(documentName),
      decodedTarget,
    );
    const relative = path.relative(repositoryRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push(`${documentName} contains a link outside the repository.`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push(`${documentName} links to missing file ${decodedTarget}.`);
    }
  }
}

const isCommandLine =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCommandLine) {
  try {
    const result = assertRepositoryGovernance(process.cwd());
    console.log(
      `Validated ${result.documentCount} linked repository governance documents.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
