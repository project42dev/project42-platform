import { test, type APIRequestContext } from "@playwright/test";

/**
 * WHICH SURFACE IS UNDER TEST.
 *
 * tests/browser is pointed at two different things by two configs.
 * playwright.config.ts serves the live application, where /admin is a route the
 * portal renders. playwright.pages.config.ts serves the GitHub Pages export,
 * which `pages:export --retire-admin-routes` publishes with a redirect document
 * at /admin instead -- Admin lives on its own origin in a published deployment.
 *
 * Navigating there on the artifact does not fail, which is the trap: the
 * redirect's meta refresh takes the browser off the artifact and onto the
 * deployment's real Admin origin over the public internet, where assertions
 * written against a locally mocked portal go on passing. A gate that reaches
 * production to decide whether the artifact is sound is not a gate.
 *
 * So probe the surface and skip with the reason stated, the way
 * device-matrix.spec.ts does over /sw.js in the other direction. Identifying
 * the redirect document rather than assuming the surface means this can never
 * swallow a portal that is really there, and `npm run test:browser` still
 * proves the portal itself against the live application.
 */
export async function skipWhenAdminIsRetired(request: APIRequestContext): Promise<void> {
  const admin = await request.get("/admin");
  test.skip(
    /http-equiv="refresh"/i.test(await admin.text()),
    "This surface serves the retirement redirect at /admin rather than the portal, because " +
      "`npm run pages:export` moves Admin to its own origin. Following it would assert against " +
      "that live origin instead of the artifact. `npm run test:browser`, which drives the " +
      "application, proves the portal itself.",
  );
}
