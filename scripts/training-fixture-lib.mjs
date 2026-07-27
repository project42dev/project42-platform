import { createHash } from "node:crypto";

export function buildTrainingFixtureArtifacts(script) {
  const transcript = renderTranscript(script);
  const captions = renderWebVtt(script);
  const reducedMotion = renderReducedMotion(script);
  const textOnly = renderTextOnly(script);
  const outputs = {
    "captions/en-US.vtt": captions,
    "transcripts/en-US.md": transcript,
    "alternatives/en-US-reduced-motion.md": reducedMotion,
    "alternatives/en-US-text-only.md": textOnly,
  };
  const integrity = {
    schemaVersion: "1.0",
    classScript: {
      id: script.id,
      version: script.version,
      sha256: sha256(`${JSON.stringify(script, null, 2)}\n`),
    },
    artifacts: Object.entries(outputs).map(([path, content]) => ({
      path,
      sha256: sha256(content),
    })),
  };
  outputs["integrity.json"] = `${JSON.stringify(integrity, null, 2)}\n`;
  return outputs;
}

export function renderTranscript(script) {
  const lines = [
    `# ${script.title}`,
    "",
    `Package: \`${script.id}\` ${script.version}`,
    "",
    "> This is the canonical text equivalent of an AI-assisted virtual-instructor",
    "> class. It remains usable without synthesized audio, video, animation, or a",
    "> player runtime.",
    "",
  ];
  for (const segment of script.segments) {
    lines.push(
      `## ${titleCase(segment.kind)}: ${titleCase(segment.id)}`,
      "",
    );
    if (segment.spokenText) lines.push(segment.spokenText, "");
    if (segment.expectedLearnerAction) {
      lines.push(`Expected learner action: ${segment.expectedLearnerAction}`, "");
    }
    if (segment.feedback) {
      lines.push(
        `Correct feedback: ${segment.feedback.correct}`,
        "",
        `Retry feedback: ${segment.feedback.retry}`,
        "",
      );
    }
    if (segment.sourceUrls.length > 0) {
      lines.push(
        "Sources:",
        "",
        ...segment.sourceUrls.map((url) => `- <${url}>`),
        "",
      );
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export function renderWebVtt(script) {
  const cues = [];
  let cursor = 0;
  let cueNumber = 1;
  for (const segment of script.segments) {
    const start = cursor;
    cursor += segment.estimatedSeconds;
    if (!segment.spokenText) continue;
    const chunks = chunkCaptionText(segment.spokenText);
    const secondsPerChunk = segment.estimatedSeconds / chunks.length;
    for (let index = 0; index < chunks.length; index += 1) {
      const cueStart = start + index * secondsPerChunk;
      const cueEnd = start + (index + 1) * secondsPerChunk;
      cues.push(
        `${cueNumber}`,
        `${timestamp(cueStart)} --> ${timestamp(cueEnd)}`,
        chunks[index].join("\n"),
        "",
      );
      cueNumber += 1;
    }
  }
  return `WEBVTT\n\n${cues.join("\n").trim()}\n`;
}

export function renderReducedMotion(script) {
  const lines = [
    `# ${script.title}: reduced-motion presentation`,
    "",
    "Present every visual as a complete static composition. Do not make completion",
    "depend on animation timing, autoplay, or pointer gestures.",
    "",
  ];
  for (const segment of script.segments.filter((entry) => entry.visual)) {
    lines.push(
      `## ${segment.id}`,
      "",
      segment.visual.reducedMotionDescription,
      "",
      `Text alternative: ${segment.visual.altText}`,
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

export function renderTextOnly(script) {
  const lines = [
    `# ${script.title}: text-only class`,
    "",
    "This route contains the complete teaching content, learner actions, feedback,",
    "and assessment handoff without requiring audio, video, or animation.",
    "",
  ];
  for (const segment of script.segments) {
    lines.push(
      `## ${titleCase(segment.kind)}: ${titleCase(segment.id)}`,
      "",
    );
    if (segment.spokenText) lines.push(segment.spokenText, "");
    if (segment.visual) lines.push(`Visual alternative: ${segment.visual.altText}`, "");
    if (segment.expectedLearnerAction) {
      lines.push(`Learner action: ${segment.expectedLearnerAction}`, "");
    }
    if (segment.feedback) {
      lines.push(
        `If correct: ${segment.feedback.correct}`,
        "",
        `If retrying: ${segment.feedback.retry}`,
        "",
      );
    }
    if (segment.sourceUrls.length > 0) {
      lines.push(
        "Sources:",
        "",
        ...segment.sourceUrls.map((url) => `- <${url}>`),
        "",
      );
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

function chunkCaptionText(text) {
  const words = text.trim().split(/\s+/u);
  const cues = [];
  let lines = [];
  let line = "";
  let cueWordCount = 0;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const wouldExceedWords = cueWordCount >= 10;
    if (candidate.length <= 42 && !wouldExceedWords) {
      line = candidate;
      cueWordCount += 1;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    cueWordCount += 1;
    if (lines.length === 2 || cueWordCount >= 10) {
      cues.push(lines);
      lines = [];
      cueWordCount = 1;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 0) {
    cues.push(lines);
  }
  return cues;
}

function timestamp(totalSeconds) {
  const milliseconds = Math.round(totalSeconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(remainder).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function titleCase(value) {
  return value
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
