import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const apiOrigin = process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN;
const hostedIdentityConfigured = Boolean(apiOrigin);
const now = "2026-07-29T12:00:00.000Z";
const account = {
  id: "profile-controls-account",
  installationId: "test",
  identity: {
    issuer: "https://issuer.example",
    subject: "profile-controls-subject",
  },
  displayName: "Profile learner",
  primaryEmail: "learner@example.test",
  emailVerified: true,
  state: "approved",
  roles: ["learner"],
  createdAt: now,
  updatedAt: now,
};

interface Profile {
  userId: string;
  displayName: string | null;
  bio: string | null;
  organization: string | null;
  location: string | null;
  websiteUrl: string | null;
  locale: string | null;
  timeZone: string | null;
  reducedMotion: boolean;
  highContrast: boolean;
  createdAt: string;
  updatedAt: string;
}

function initialProfile(): Profile {
  return {
    userId: account.id,
    displayName: account.displayName,
    bio: null,
    organization: null,
    location: null,
    websiteUrl: null,
    locale: "en-US",
    timeZone: "UTC",
    reducedMotion: false,
    highContrast: false,
    createdAt: now,
    updatedAt: now,
  };
}

function jsonHeaders(route: Route) {
  return {
    "access-control-allow-origin":
      route.request().headers().origin ?? "http://127.0.0.1",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,x-request-id",
    "access-control-allow-methods": "DELETE,GET,POST,PATCH,PUT,OPTIONS",
    "content-type": "application/json",
  };
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    headers: jsonHeaders(route),
    body: JSON.stringify(body),
  });
}

async function installBaselineApi(
  page: Page,
  handle: (route: Route, pathname: string) => Promise<boolean>,
): Promise<void> {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: jsonHeaders(route) });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (await handle(route, pathname)) return;
    const bodies: Record<string, unknown> = {
      "/v1/auth/session": { account },
      "/v1/me/identities": { identities: [] },
      "/v1/me/consents": { consents: [] },
      "/v1/me/deletion": { requests: [] },
    };
    if (pathname in bodies) {
      await fulfillJson(route, bodies[pathname]);
      return;
    }
    await fulfillJson(route, { error: { code: "not_found" } }, 404);
  });
}

test.describe("hosted profile and learner-data controls", () => {
  test.beforeEach(() => {
    test.skip(
      !hostedIdentityConfigured,
      "Hosted profile tests require account-API configuration.",
    );
  });

  test("edits the existing profile while applying accessible browser preferences", async ({
    page,
  }) => {
    let profile = initialProfile();
    const profilePatches: Array<Record<string, unknown>> = [];
    const preferencePatches: Array<Record<string, unknown>> = [];

    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { profile });
        return true;
      }
      if (pathname === "/v1/me/profile" && request.method() === "PATCH") {
        const patch = request.postDataJSON() as Record<string, unknown>;
        if ("locale" in patch) {
          preferencePatches.push(patch);
          profile = {
            ...profile,
            locale: String(patch.locale),
            timeZone: String(patch.timeZone),
            reducedMotion: Boolean(patch.reducedMotion),
            highContrast: Boolean(patch.highContrast),
            updatedAt: "2026-07-29T12:05:30.000Z",
          };
        } else {
          profilePatches.push(patch);
          profile = {
            ...profile,
            displayName: String(patch.displayName ?? "") || null,
            bio: String(patch.bio ?? "") || null,
            organization: String(patch.organization ?? "") || null,
            location: String(patch.location ?? "") || null,
            websiteUrl: String(patch.websiteUrl ?? "") || null,
            updatedAt: "2026-07-29T12:05:00.000Z",
          };
        }
        await fulfillJson(route, { profile });
        return true;
      }
      return false;
    });

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "How you appear in Project 42" }),
    ).toBeVisible();

    await page.getByLabel("Display name").fill("Ada Learner");
    await page.getByLabel("Organization").fill("Example Lab");
    await page.getByLabel("Location").fill("New York");
    await page.getByLabel("Website").fill("https://example.test/ada");
    await page.getByLabel("About you").fill("Building reliable agents.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect.poll(() => profilePatches.length).toBe(1);
    await expect(page.getByLabel("Display name")).toHaveValue("Ada Learner");
    expect(profilePatches).toEqual([
      {
        displayName: "Ada Learner",
        bio: "Building reliable agents.",
        organization: "Example Lab",
        location: "New York",
        websiteUrl: "https://example.test/ada",
      },
    ]);


    // Capture the deployment theme's own ink before any preference is applied.
    // Asserting a literal here silently binds the test to whichever theme was
    // configured when it was written: the increase-contrast override sets
    // --ink to #000, so a literal "#000" only passed while the configured
    // theme also happened to use black ink. The contract is that clearing the
    // preference restores the theme's value, not that the value is black.
    const baselineInk = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ink")
        .trim(),
    );
    expect(baselineInk).not.toBe("");

    await page.getByLabel("Language tag for dates and times").fill("en-GB");
    await page.getByLabel("Time zone").fill("America/Los_Angeles");
    await page.getByLabel("Always reduce motion").check();
    await page.getByLabel("Increase contrast").check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(
      page.getByText(
        "Preferences saved to your account and applied to this session.",
      ),
    ).toBeVisible();
    expect(preferencePatches).toEqual([
      {
        locale: "en-GB",
        timeZone: "America/Los_Angeles",
        reducedMotion: true,
        highContrast: true,
      },
    ]);
    await expect(page.locator("html")).toHaveAttribute(
      "data-project42-reduced-motion",
      "true",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-project42-high-contrast",
      "true",
    );
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("project42.profile-preferences.v1"),
      ),
    ).toBeNull();

    await page.reload();
    await expect(page.getByLabel("Always reduce motion")).toBeChecked();
    await expect(page.getByLabel("Increase contrast")).toBeChecked();
    await page.getByLabel("Always reduce motion").uncheck();
    await page.getByLabel("Increase contrast").uncheck();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await page.emulateMedia({ reducedMotion: "reduce", contrast: "more" });
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-project42-reduced-motion",
      /.+/,
    );
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-project42-high-contrast",
      /.+/,
    );
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    ).toBe("auto");
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--ink")
          .trim(),
      ),
    ).toBe(baselineInk);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("reviews optional consent toggles and deletion receipts through request and cancellation", async ({
    page,
  }) => {
    const consents = [
      { purpose: "product-improvement", decision: "withdrawn" },
      { purpose: "learning-reminders", decision: "withdrawn" },
    ];
    let deletions = [
      {
        id: "deletion-open",
        state: "requested",
        requestedAt: "2026-07-29T10:00:00.000Z",
        cancellationDeadline: "2026-08-05T10:00:00.000Z",
        completedAt: null,
      },
      {
        id: "deletion-completed",
        state: "completed",
        requestedAt: "2026-06-01T10:00:00.000Z",
        cancellationDeadline: "2026-06-08T10:00:00.000Z",
        completedAt: "2026-06-10T10:00:00.000Z",
      },
    ];
    const consentPatches: Array<Record<string, unknown>> = [];
    const deletionWrites: Array<Record<string, unknown>> = [];

    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { profile: initialProfile() });
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "GET") {
        await fulfillJson(route, { consents });
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "PATCH") {
        const input = request.postDataJSON() as Record<string, unknown>;
        consentPatches.push(input);
        const purpose = String(input.purpose);
        const decision = String(input.decision);
        const idx = consents.findIndex((c) => c.purpose === purpose);
        if (idx >= 0) consents[idx] = { purpose, decision };
        await fulfillJson(route, { consents });
        return true;
      }
      if (pathname === "/v1/me/deletion" && request.method() === "GET") {
        await fulfillJson(route, { requests: deletions });
        return true;
      }
      if (pathname === "/v1/me/deletion" && request.method() === "DELETE") {
        const cancelled = { ...deletions[0], state: "cancelled" };
        deletions = [cancelled, deletions[1]];
        await fulfillJson(route, { deletionRequest: cancelled });
        return true;
      }
      if (pathname === "/v1/me/deletion" && request.method() === "POST") {
        deletionWrites.push(
          request.postDataJSON() as Record<string, unknown>,
        );
        const deletionRequest = {
          id: "deletion-new",
          state: "requested",
          requestedAt: "2026-07-29T12:15:00.000Z",
          cancellationDeadline: "2026-08-05T12:15:00.000Z",
          completedAt: null,
        };
        deletions = [deletionRequest, ...deletions];
        await fulfillJson(
          route,
          {
            deletionRequest,
            receipt: {
              requestId: deletionRequest.id,
              statusToken:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              issuedAt: "2026-07-29T12:15:00.000Z",
            },
          },
          201,
        );
        return true;
      }
      return false;
    });

    await page.goto("/account");

    // Optional consent toggles — both start off (withdrawn)
    await expect(
      page.getByRole("heading", { name: "Your account and learner data" }),
    ).toBeVisible();
    const productImprovementToggle = page.getByRole("switch", {
      name: "Product improvement",
    });
    const learningRemindersToggle = page.getByRole("switch", {
      name: "Learning reminders",
    });
    await expect(productImprovementToggle).not.toBeChecked();
    await expect(learningRemindersToggle).not.toBeChecked();

    // Grant product-improvement consent
    await productImprovementToggle.check();
    await expect(page.getByText("Product improvement consent granted.")).toBeVisible();
    expect(consentPatches).toEqual([
      { purpose: "product-improvement", decision: "granted" },
    ]);

    // Withdraw it
    await productImprovementToggle.uncheck();
    await expect(page.getByText("Product improvement consent withdrawn.")).toBeVisible();

    // Grant learning-reminders consent
    await learningRemindersToggle.check();
    await expect(page.getByText("Learning reminders consent granted.")).toBeVisible();

    // Deletion history and flow
    await expect(
      page.getByLabel("Deletion request identifier deletion-completed"),
    ).toContainText("Request deletion-completed");
    await expect(
      page.getByLabel("Deletion request identifier deletion-open"),
    ).toContainText("Request deletion-open");
    await page.getByRole("button", { name: "Cancel deletion" }).click();
    await expect(page.getByText("Deletion request cancelled.")).toBeVisible();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible();

    await page
      .getByLabel("Enter DELETE MY PROJECT 42 ACCOUNT")
      .fill("DELETE MY PROJECT 42 ACCOUNT");
    await page.getByRole("button", { name: "Request deletion" }).click();
    const receipt = page.getByRole("complementary", {
      name: "Save your one-time private status receipt",
    });
    await expect(receipt).toBeVisible();
    await expect(receipt.getByLabel("Request ID")).toHaveValue("deletion-new");
    await expect(receipt.getByLabel("Private status token")).toHaveValue(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    await expect(
      page.getByLabel("Deletion request identifier deletion-new"),
    ).toContainText("Request deletion-new");
    expect(
      await page.evaluate(() => {
        const values = (target: Storage) =>
          Array.from({ length: target.length }, (_, index) =>
            target.getItem(target.key(index) ?? ""),
          ).join(" ");
        return `${values(window.localStorage)} ${values(window.sessionStorage)}`;
      }),
    ).not.toContain("aaaaaaaaaaaaaaaa");
    await page.getByRole("button", { name: "I saved this receipt" }).click();
    await expect(receipt).toHaveCount(0);
    expect(deletionWrites).toEqual([
      { confirmation: "DELETE MY PROJECT 42 ACCOUNT" },
    ]);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("keeps approved profile and consent writes scoped to the current account", async ({
    page,
  }) => {
    const writes: Array<{ pathname: string; search: string; body: unknown }> = [];
    let profile = initialProfile();

    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { profile });
        return true;
      }
      if (pathname === "/v1/me/profile" && request.method() === "PATCH") {
        const url = new URL(request.url());
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ pathname, search: url.search, body });
        profile = { ...profile, ...body, updatedAt: now };
        await fulfillJson(route, { profile });
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "GET") {
        await fulfillJson(route, {
          consents: [
            { purpose: "product-improvement", decision: "withdrawn" },
            { purpose: "learning-reminders", decision: "withdrawn" },
          ],
        });
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "PATCH") {
        const url = new URL(request.url());
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ pathname, search: url.search, body });
        await fulfillJson(route, {
          consents: [
            { purpose: "product-improvement", decision: "withdrawn" },
            { purpose: "learning-reminders", decision: "withdrawn" },
          ],
        });
        return true;
      }
      return false;
    });

    await page.goto("/account");
    await expect(
      page.getByText(
        "These preferences are synchronized with your approved account and applied to this browser session.",
      ),
    ).toBeVisible();
    await page.getByLabel("Language tag for dates and times").fill("fr-FR");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await page
      .getByRole("switch", { name: "Product improvement" })
      .check();

    expect(writes).toEqual([
      {
        pathname: "/v1/me/profile",
        search: "",
        body: {
          locale: "fr-FR",
          timeZone: "UTC",
          reducedMotion: false,
          highContrast: false,
        },
      },
      {
        pathname: "/v1/me/consents",
        search: "",
        body: {
          purpose: "product-improvement",
          decision: "granted",
        },
      },
    ]);
    for (const write of writes) {
      expect(JSON.stringify(write.body)).not.toContain("userId");
      expect(JSON.stringify(write.body)).not.toContain("profile-controls-subject");
    }
  });

  test("uses in-memory fallback when the hosted contract is legacy", async ({
    page,
  }) => {
    const legacyProfile = initialProfile() as Partial<Profile>;
    delete legacyProfile.locale;
    delete legacyProfile.timeZone;
    delete legacyProfile.reducedMotion;
    delete legacyProfile.highContrast;
    let preferenceWrites = 0;

    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { profile: legacyProfile });
        return true;
      }
      if (pathname === "/v1/me/profile" && request.method() === "PATCH") {
        preferenceWrites += 1;
        await fulfillJson(route, { profile: legacyProfile });
        return true;
      }
      return false;
    });

    await page.goto("/account");
    await expect(
      page.getByText(/does not yet expose preference fields/i),
    ).toBeVisible();
    await page.getByLabel("Language tag for dates and times").fill("en-CA");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(
      page.getByText("Preferences applied to this browser session."),
    ).toBeVisible();
    expect(preferenceWrites).toBe(0);
    // Preferences are in-memory only; no localStorage key is written.
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("project42.profile-preferences.v1"),
      ),
    ).toBeNull();
  });

  test("keeps an accessible session fallback when hosted profile loading is offline", async ({
    page,
  }) => {
    let writes = 0;
    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { error: { code: "unavailable" } }, 503);
        return true;
      }
      if (pathname === "/v1/me/profile" && request.method() === "PATCH") {
        writes += 1;
        await fulfillJson(route, { error: { code: "unavailable" } }, 503);
        return true;
      }
      return false;
    });

    await page.goto("/account");
    await expect(
      page.getByText(/Hosted preferences could not be reached/i),
    ).toBeVisible();
    await page.getByLabel("Time zone").fill("Europe/Paris");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(
      page.getByText("Preferences applied to this browser session."),
    ).toBeVisible();
    expect(writes).toBe(0);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("checks deletion status while signed out without retaining the private token", async ({
    page,
  }) => {
    const privateToken =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await page.route(`${apiOrigin}/**`, async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: jsonHeaders(route) });
        return;
      }
      if (pathname === "/v1/auth/session") {
        await fulfillJson(route, { error: { code: "unauthorized" } }, 401);
        return;
      }
      if (pathname === "/v1/registration/status") {
        await fulfillJson(
          route,
          { error: { code: "registration_receipt_invalid" } },
          401,
        );
        return;
      }
      if (pathname === "/v1/deletion-status" && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (
          body.requestId !== "deletion-after-account" ||
          body.statusToken !== privateToken
        ) {
          await fulfillJson(
            route,
            {
              error: {
                code: "not_found",
                message: "Other Learner, other@example.test",
              },
            },
            404,
          );
          return;
        }
        await fulfillJson(route, {
          status: {
            requestId: "deletion-after-account",
            state: "completed",
            requestedAt: "2026-07-20T12:00:00.000Z",
            cancellationDeadline: "2026-07-27T12:00:00.000Z",
            completedAt: "2026-07-28T12:00:00.000Z",
          },
        });
        return;
      }
      await fulfillJson(route, { error: { code: "not_found" } }, 404);
    });

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Request a Project 42 account" }),
    ).toBeVisible();
    await page.getByLabel("Request ID").fill("deletion-after-account");
    await page.getByLabel("Private status token").fill(privateToken);
    await page.getByRole("button", { name: "Check deletion status" }).click();
    await expect(page.getByText("completed", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Request ID")).toHaveValue("");
    await expect(page.getByLabel("Private status token")).toHaveValue("");
    const storage = await page.evaluate(() => {
      const values = (target: Storage) =>
        Array.from({ length: target.length }, (_, index) =>
          target.getItem(target.key(index) ?? ""),
        ).join(" ");
      return `${values(window.localStorage)} ${values(window.sessionStorage)}`;
    });
    expect(storage).not.toContain(privateToken);

    await page.getByLabel("Request ID").fill("another-account");
    await page
      .getByLabel("Private status token")
      .fill("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
    await page.getByRole("button", { name: "Check deletion status" }).click();
    await expect(
      page.getByText(/could not be verified/i),
    ).toBeVisible();
    await expect(page.getByText(/other@example\.test/i)).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("requires recent authentication and redacts untrusted API failure details", async ({
    page,
  }) => {
    const privateDetail =
      "DATABASE_CONNECTION_STRING=do-not-render tenant-secret=do-not-render";
    const authStartPattern = `${apiOrigin}/v1/auth/start**`;

    await installBaselineApi(page, async (route, pathname) => {
      const request = route.request();
      if (pathname === "/v1/me/profile" && request.method() === "GET") {
        await fulfillJson(route, { profile: initialProfile() });
        return true;
      }
      if (pathname === "/v1/me/profile" && request.method() === "PATCH") {
        await fulfillJson(
          route,
          { error: { code: "internal_error", message: privateDetail } },
          500,
        );
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "GET") {
        await fulfillJson(route, {
          consents: [
            { purpose: "product-improvement", decision: "withdrawn" },
            { purpose: "learning-reminders", decision: "withdrawn" },
          ],
        });
        return true;
      }
      if (pathname === "/v1/me/consents" && request.method() === "PATCH") {
        await fulfillJson(
          route,
          { error: { code: "internal_error", message: privateDetail } },
          500,
        );
        return true;
      }
      if (pathname === "/v1/me/export" && request.method() === "GET") {
        await fulfillJson(
          route,
          {
            error: {
              code: "recent_authentication_required",
              message: privateDetail,
            },
          },
          403,
        );
        return true;
      }
      if (pathname === "/v1/auth/start") {
        await route.abort("aborted");
        return true;
      }
      return false;
    });

    await page.goto("/account");
    await page.getByLabel("Display name").fill("Unsafe response check");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(
      page.getByText(
        "Your profile could not be saved. No local learning progress was changed.",
      ),
    ).toBeVisible();


    await page
      .getByRole("switch", { name: "Product improvement" })
      .check();
    await expect(
      page.getByText("Consent could not be updated. Your previous decision is unchanged."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Download my data" }).click();
    await expect(
      page.getByText(
        "Sign out and sign in again before exporting this sensitive account data.",
      ),
    ).toBeVisible();
    await expect(page.getByText(privateDetail)).toHaveCount(0);
    await expect(page.getByText(/DATABASE_CONNECTION_STRING/)).toHaveCount(0);

    const requestPromise = page.waitForRequest(authStartPattern);
    await page.getByRole("button", { name: "Sign in again" }).click();
    const request = await requestPromise;
    expect(new URL(request.url()).searchParams.get("return_to")).toBe(
      new URL("/account", page.url()).toString(),
    );
  });
});
