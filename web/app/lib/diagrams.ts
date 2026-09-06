import diagramConfig from "@project42/platform/content/diagrams/catalogue.json";
import overrides from "../../config/diagram-catalog-overrides.json";

export interface Project42Diagram {
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  altText: string;
  caption: string;
  takeaways: string[];
  source: string;
}

const diagramsById = new Map<string, Project42Diagram>();
for (const diagram of [...diagramConfig.diagrams, ...overrides.diagrams] as Project42Diagram[]) {
  diagramsById.set(diagram.id, diagram);
}

export const diagramCatalog = Object.freeze([...diagramsById.values()]);

export function getDiagram(id: string) {
  return diagramCatalog.find((diagram) => diagram.id === id);
}
