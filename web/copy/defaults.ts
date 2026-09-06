// Every user-visible string on the marketing and policy pages, carrying the
// Project 42 wording verbatim as the shipped default.
//
// This file is PRODUCT: an adopter never edits it. They write the leaves they
// want to change into project42.copy.json in their own front-end repository,
// and lib/copy.ts merges the two -- so an adopter overrides rather than forks.
//
// One module per page, because that is the unit an adopter thinks in.
import { metaCopy } from "./meta";
import { chromeCopy } from "./chrome";
import { homeCopy } from "./home";
import { aboutCopy } from "./about";
import { platformCopy } from "./platform";
import { supportCopy } from "./support";
import { roadmapCopy } from "./roadmap";
import { releasesCopy } from "./releases";
import { legalCopy } from "./legal";
import { learnerDataCopy } from "./learnerData";

export const copyDefaults = {
  meta: metaCopy,
  chrome: chromeCopy,
  home: homeCopy,
  about: aboutCopy,
  platform: platformCopy,
  support: supportCopy,
  roadmap: roadmapCopy,
  releases: releasesCopy,
  legal: legalCopy,
  learnerData: learnerDataCopy,
};
