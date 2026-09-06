import {
  generatedClassScriptPackages,
  generatedInstructorRenderings,
  generatedTrainingPackageCoverage,
} from "./generated/training-packages.js";

export const classScriptPackages = generatedClassScriptPackages;
export const trainingPackageCoverage = generatedTrainingPackageCoverage;

// Which lessons have been filmed. Generated from project42-content, so a
// consumer rendering an on-demand page reads the list the curriculum declares
// rather than keeping its own. A route built from the class scripts instead
// would publish a page for every scripted module and advertise a video library
// that does not exist.
export const instructorRenderings = generatedInstructorRenderings;

export function getClassScriptPackage(moduleId: string) {
  return classScriptPackages.find((script) => script.moduleId === moduleId);
}

export function getInstructorRendering(moduleId: string) {
  return instructorRenderings.find((rendering) => rendering.moduleId === moduleId);
}
