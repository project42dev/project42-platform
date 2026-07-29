import { readFile } from "node:fs/promises";
import { executeBoundedAgentLab } from "./lab.mjs";

const caseSet = JSON.parse(
  await readFile(new URL("../cases.json", import.meta.url), "utf8"),
);
const evidence = executeBoundedAgentLab(caseSet);

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
