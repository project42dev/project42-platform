// The catalogue's shape, for the client.
//
// Three components track a learner's progress in the browser, and each was
// handed the whole catalogue. The progress API reads eight fields from it --
// contentVersion, a path's id, title, moduleIds and badge, a module's id,
// title and capstone -- and every module body, knowledge check and source
// list came along for the ride: 1.3 MB the browser downloads and never
// renders.
//
// Importing lib/catalog here would put it back, however narrow the use: a
// projection computed at run time still has the full object in the module
// graph. So the projection is generated at materialise time into
// lib/progressCatalog.generated.ts, which imports nothing, and this is the
// module client components read.
//
// The rule that keeps it true: a "use client" module may import this, never
// lib/catalog. tests/surface-isolation.test.mjs holds the line.

import type { Catalog } from "@project42/platform";
import { generatedProgressCatalog } from "./progressCatalog.generated";

export const progressCatalog: Catalog = generatedProgressCatalog;
