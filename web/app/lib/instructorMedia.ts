import {
  getInstructorRendering as getCurriculumRendering,
  instructorRenderings as curriculumRenderings,
  type InstructorRenderingManifest,
} from "@project42/platform";

// Which instructor-led lessons have actually been rendered.
//
// This list is no longer kept here. It used to live in
// config/instructor-renderings.json beside a TypeScript mirror of its shape,
// which made "which lessons have been filmed" a fact about this deployment's
// front end. ADR-0020 settles that instructor-led delivery is a *rendering of
// the same content item*, not a second catalogue, so it is a fact about the
// curriculum. project42-content now carries each manifest beside the class
// script it was rendered from, the platform validates it against that script
// and exports it, and this file only adapts it for the page.
//
// The rule the old list existed to enforce still holds, and now holds upstream:
// a class script existing does not mean a video exists. Forty modules carry a
// class script and exactly one has been filmed. A page that inferred
// availability from the script would advertise thirty-nine lessons nobody can
// watch.
//
// The platform ships a full VirtualInstructorMediaManifest contract for
// released lessons, which requires a class-script hash, model and voice profile
// refs, pronunciation-review evidence, and four sign-offs. This render has none
// of those yet - the class script itself is still releaseStatus "draft" - so it
// is published under the explicit preview tier rather than a contract it cannot
// meet.

/** Where this deployment serves rendered lessons from. */
const MEDIA_BASE = "/preview/";

export interface InstructorRendering {
  moduleId: string;
  pathId: string;
  /**
   * Path under /public, resolved here from the curriculum's bare media key.
   * The key is a filename, not a URL: the video is tens of megabytes of derived
   * binary and does not belong in a hash-locked text curriculum, so where it is
   * served from is this deployment's decision and nobody else's.
   */
  src: string;
  /** Seconds of video that exist, which is not the planned lesson length. */
  renderedSeconds: number;
  /** How many of the class script's segments were spoken in this render. */
  renderedSegments: number;
  /** Azure Speech batch avatar character and style. */
  avatar: string;
  /** SSML voice name. Never mai-voice-2: it emits no word timing. */
  voice: string;
  renderedAt: string;
  captions: "embedded" | "sidecar" | "none";
  /**
   * True while the render covers only part of the script. The lesson page has
   * to say so, because a player that stops a minute into an eighteen minute
   * lesson otherwise reads as a broken video rather than a preview.
   */
  partial: boolean;
  /** What the learner is told about the synthetic instructor. */
  disclosure: string;
}

function adapt(manifest: InstructorRenderingManifest): InstructorRendering {
  return {
    moduleId: manifest.moduleId,
    pathId: manifest.pathId,
    src: `${MEDIA_BASE}${manifest.media.key}`,
    renderedSeconds: manifest.renderedSeconds,
    renderedSegments: manifest.renderedSegments,
    avatar: manifest.production.avatar,
    voice: manifest.production.voice,
    renderedAt: manifest.renderedAt,
    captions: manifest.media.captions,
    partial: manifest.releaseStatus === "preview",
    disclosure: manifest.production.disclosure,
  };
}

export const instructorRenderings: InstructorRendering[] = Object.freeze(
  curriculumRenderings.map(adapt),
) as InstructorRendering[];

export function getInstructorRendering(
  moduleId: string,
): InstructorRendering | undefined {
  const manifest = getCurriculumRendering(moduleId);
  return manifest ? adapt(manifest) : undefined;
}

export function formatLessonLength(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return `${totalSeconds} sec`;
  return `${minutes} min`;
}

export function formatSegmentLength(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

// The class script's own vocabulary, spelled for a learner rather than for the
// production pipeline. Every kind in CLASS_SEGMENT_KINDS is covered, so a new
// kind shows up as itself instead of silently rendering blank.
export const SEGMENT_KIND_LABELS: Record<string, string> = {
  welcome: "Welcome",
  narration: "Teaching",
  demonstration: "Demonstration",
  "learner-prompt": "Over to you",
  pause: "Pause",
  checkpoint: "Checkpoint",
  feedback: "Feedback",
  transition: "Transition",
  "assessment-handoff": "Into the knowledge check",
  closing: "Closing",
};
