import releaseFacts from "../../public/release-facts.json";

export type ProjectProvider = (typeof releaseFacts.providers)[number];

export const siteFacts = releaseFacts;
