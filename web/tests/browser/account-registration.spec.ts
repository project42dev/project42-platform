import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const apiOrigin = process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN;
const hostedIdentityConfigured = Boolean(apiOrigin);
const requestedAt = "2026-07-29T10:00:00.000Z";
const updatedAt = "2026-07-29T10:05:00.000Z";

function responseHeaders(route: Route, extra: Record<string, string> = {}) {
  return {
    "access-control-allow-origin":
      route.request().headers().origin ?? "http://127.0.0.1",
    "access-control-allow-credentials": "true",
    "content-type": "application/json",
    ...extra,
  };
}

async function installRegistrationApi(
  page: Page,
  registration:
    | {
      status?: number;
      headers?: Record<string, string>;
      body: unknown;
    }
    | undefined,
) {
  let statusRequests = 0;
  let acceptanceRequests = 0;
  let acceptedTerms: unknown;
  await page.route(`${apiOrigin}/**`, async (route) => {
    const target = new URL(route.request().url());
    if (target.pathname === "/v1/auth/session") {
      await route.fulfill({
        status: 401,
        headers: responseHeaders(route),
        body: JSON.stringify({
          error: { code: "authentication_required" },
        }),
      });
      return;
    }
    if (target.pathname === "/v1/registration/terms-acceptance") {
      acceptanceRequests += 1;
      acceptedTerms = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        headers: responseHeaders(route),
        body: JSON.stringify({
          acceptance: {
            purpose: "terms-of-service",
            policyVersion: "1.0",
          },
        }),
      });
      return;
    }
    if (target.pathname === "/v1/registration/status") {
      statusRequests += 1;
      await route.fulfill({
        status: registration ? (registration.status ?? 200) : 401,
        headers: responseHeaders(route, registration?.headers),
        body: JSON.stringify(
          registration?.body ?? {
            error: { code: "registration_receipt_invalid" },
          },
        ),
      });
      return;
    }
    if (target.pathname === "/v1/auth/start") {
      await route.abort("aborted");
      return;
    }
    await route.fulfill({
      status: 404,
      headers: responseHeaders(route),
      body: JSON.stringify({ error: { code: "not_found" } }),
    });
  });
  return {
    statusRequests: () => statusRequests,
    acceptanceRequests: () => acceptanceRequests,
    acceptedTerms: () => acceptedTerms,
  };
}

test.describe("learner account request and private status receipt", () => {
  test.beforeEach(() => {
    test.skip(
      !hostedIdentityConfigured,
      "Registration journeys require account-API configuration.",
    );
  });

  test("presents a public provider-neutral request entry with account expectations", async ({
    page,
  }) => {
    await installRegistrationApi(page, undefined);
    await page.goto("/account");

    await expect(
      page.getByRole("heading", { name: "Request a Project 42 account" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Request an account" }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not create an authenticated learner session/i),
    ).toBeVisible();
    await expect(
      page.getByText(/learner data, consent, retention, and recovery/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Legal & Transparency page" }),
    ).toHaveAttribute(
      "href",
      "/legal-transparency",
    );

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  // This test used to assert that opening a module while signed out bounced
  // the browser through /v1/auth/start. That is no longer how the portal
  // works, and the assertion had gone unenforced because CI never ran the
  // browser suite: module pages are public reading, and it is *participation*
  // - answering a knowledge check and having the result recorded - that needs
  // an approved account. It also read the catalog at /learn, which is now the
  // self-paced/instructor chooser; the catalog is at /learn/paths.
  //
  // What is checked here is therefore the real boundary: the catalog and a
  // module render for an anonymous browser, no sign-in hand-off is forced on
  // them, and nothing is written to the hosted account while they read. The
  // signed-in scoring path is covered by foundations-journey.spec.ts.
  test("lets an anonymous browser read the catalog and a module without a sign-in hand-off or a hosted write", async ({
    page,
  }) => {
    const authStarts: string[] = [];
    const hostedWrites: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!apiOrigin || !url.startsWith(apiOrigin)) return;
      if (new URL(url).pathname === "/v1/auth/start") authStarts.push(url);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        hostedWrites.push(`${request.method()} ${new URL(url).pathname}`);
      }
    });

    await installRegistrationApi(page, undefined);
    await page.goto("/learn/paths");
    await expect(
      page.getByRole("heading", { name: /learning paths with a clear next step/i }),
    ).toBeVisible();

    await page.goto("/learn/ai-foundations/research-with-evidence");
    await expect(
      page.getByRole("heading", { level: 1, name: /research with evidence/i }),
    ).toBeVisible();

    // Participation is the gated part, and it is not reachable without first
    // answering: the submit control stays inert for a reader.
    await expect(
      page.getByRole("button", { name: "Check my answers" }),
    ).toBeDisabled();

    expect(authStarts).toEqual([]);
    expect(hostedWrites).toEqual([]);
  });

  test("renders pending status from the HttpOnly receipt without PII or polling", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "project42.terms-acceptance.v1",
        JSON.stringify({
          termsVersion: "1.0",
          acceptedAt: "2026-07-29T09:59:00.000Z",
        }),
      );
    });
    const api = await installRegistrationApi(page, {
      body: {
        registration: {
          state: "pending",
          requestedAt,
          updatedAt,
          canSignIn: false,
          nextAction: "await-review",
          primaryEmail: "must-not-render@example.test",
          subject: "must-not-render",
        },
      },
    });
    await page.goto("/account?auth=pending");

    await expect(
      page.getByRole("heading", {
        name: "Your access request is waiting for review",
      }),
    ).toBeVisible();
    await expect(page.getByText("pending", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/no hosted learner session exists yet/i),
    ).toBeVisible();
    await expect(page.getByText(/does not poll automatically/i)).toBeVisible();
    await expect(page.getByText("must-not-render@example.test")).toHaveCount(0);
    await expect(page.getByText("must-not-render")).toHaveCount(0);
    await expect(page).toHaveURL(/\/account\/?$/);
    await expect.poll(api.statusRequests).toBe(1);
    await expect.poll(api.acceptanceRequests).toBe(1);
    expect(api.acceptedTerms()).toEqual({
      termsVersion: "1.0",
      acceptedAt: "2026-07-29T09:59:00.000Z",
    });
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("project42.terms-acceptance.v1"),
      ),
    ).toBeNull();

    const retry = page.getByRole("button", {
      name: /check again in \d+ seconds/i,
    });
    await expect(retry).toBeDisabled();
    await page.waitForTimeout(250);
    expect(api.statusRequests()).toBe(1);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test("shows a rejected decision without exposing a private reason", async ({
    page,
  }) => {
    await installRegistrationApi(page, {
      body: {
        registration: {
          state: "rejected",
          requestedAt,
          updatedAt,
          canSignIn: false,
          nextAction: "contact-owner",
          reason: "private owner note",
        },
      },
    });
    await page.goto("/account?auth=rejected");

    await expect(
      page.getByRole("heading", {
        name: "Your access request was not approved",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not expose a private review reason/i),
    ).toBeVisible();
    await expect(page.getByText("private owner note")).toHaveCount(0);
  });

  test("recovers from an expired or replaced receipt through a new secure sign-in", async ({
    page,
  }) => {
    await installRegistrationApi(page, undefined);
    // AuthProvider maps a *pending* callback whose status check 401s to the
    // request form (phase "none") on purpose - a brand-new requester is not
    // told their receipt is broken. The expired-receipt card is reached by a
    // browser that already holds a receipt, which here is the rejected
    // outcome. See the note in the report: whether the pending mapping should
    // also surface this card is an open product question, not a test detail.
    await page.goto("/account?auth=rejected");
    await expect(
      page.getByRole("heading", {
        name: "This private request receipt is no longer valid",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not reveal whether access was approved/i),
    ).toBeVisible();

    const startRequest = page.waitForRequest(`${apiOrigin}/v1/auth/start**`);
    await page
      .getByRole("button", { name: "Sign in to check access" })
      .click();
    const request = await startRequest;
    const target = new URL(request.url());
    expect(target.searchParams.get("return_to")).toBe(
      new URL("/account", page.url()).toString(),
    );
  });

  test("honors Retry-After and does not expose an account on status throttling", async ({
    page,
  }) => {
    const api = await installRegistrationApi(page, {
      status: 429,
      headers: { "retry-after": "120" },
      body: {
        error: {
          code: "authentication_rate_limited",
          message: "internal detail must not render",
        },
      },
    });
    await page.goto("/account?auth=pending");

    await expect(
      page.getByRole("heading", {
        name: "Request status is temporarily unavailable",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /try again in \d+ seconds/i }),
    ).toBeDisabled();
    await expect(page.getByText("internal detail must not render")).toHaveCount(
      0,
    );
    await page.waitForTimeout(250);
    expect(api.statusRequests()).toBe(1);
  });

  test("handles approved, provider-error, and account-unavailable transitions", async ({
    page,
  }) => {
    await installRegistrationApi(page, {
      body: {
        registration: {
          state: "approved",
          requestedAt,
          updatedAt,
          canSignIn: true,
          nextAction: "sign-in",
        },
      },
    });
    await page.goto("/account?auth=pending");
    await expect(
      page.getByRole("heading", { name: "Your access is ready" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in to continue" }),
    ).toBeVisible();

    await page.unrouteAll({ behavior: "wait" });
    await installRegistrationApi(page, undefined);
    await page.goto("/account?auth=error");
    await expect(
      page.getByRole("heading", {
        name: "The identity provider did not complete the request",
      }),
    ).toBeVisible();

    await page.goto("/account?auth=unavailable");
    await expect(
      page.getByRole("heading", { name: "Hosted account access is unavailable" }),
    ).toBeVisible();
  });
});
