import {
  generatedClassScriptPackages,
  generatedTrainingPackageCoverage,
} from "./generated/training-packages.js";

export const classScriptPackages = generatedClassScriptPackages;
export const trainingPackageCoverage = generatedTrainingPackageCoverage;

export function getClassScriptPackage(moduleId: string) {
  return classScriptPackages.find((script) => script.moduleId === moduleId);
}
