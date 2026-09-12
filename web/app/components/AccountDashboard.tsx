"use client";

import type {
  DeletionStatus,
  DeletionStatusReceipt,
  LearnerProfile as PlatformLearnerProfile,
} from "@project42/platform";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { learnerDataPolicy } from "../lib/learnerDataPolicy";
import { rememberRegistrationRequest } from "../lib/registrationStatus";
import { clientCrossDomainHref } from "../lib/subdomainLinks";
import {
  useAuth,
  type AccountState,
  type Project42Account,
  type RegistrationExperience,
} from "./AuthProvider";
import {
  useProfilePreferences,
  validateProfilePreferences,
  type ProfilePreferences,
} from "./ProfilePreferencesProvider";
import { copy, orgName } from "../../lib/copy";

interface DomainRule {
  id: string;
  domain: string;
  enabled: boolean;
  policyVersion: number;
  createdAt: string;
  updatedAt: string;
}

type LearnerProfile = Omit<
  PlatformLearnerProfile,
  "locale" | "timeZone" | "reducedMotion" | "highContrast"
> & {
  locale?: string | null;
  timeZone?: string | null;
  reducedMotion?: boolean;
  highContrast?: boolean;
};

interface LinkedIdentity {
  id: string;
  provider: string;
  providerLogin: string | null;
  displayName: string | null;
  status: "active" | "unlinked";
  primary: boolean;
  linkedAt: string;
  lastVerifiedAt: string;
  lastSeenAt: string;
  unlinkedAt: string | null;
  canUnlink: boolean;
}

interface OptionalConsent {
  purpose: string;
  decision: "granted" | "withdrawn";
}

interface DeletionRequest {
  id: string;
  state: "requested" | "cancelled" | "processing" | "completed";
  requestedAt: string;
  cancellationDeadline: string;
  completedAt: string | null;
}

interface OwnerDeletionRequest {
  id: string;
  userId: string;
  state: "requested" | "processing";
  requestedAt: string;
  cancellationDeadline: string;
  displayName: string | null;
  primaryEmail: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  requestId: string;
  outcome: "success" | "denied" | "failed";
  reason: string;
  occurredAt: string;
}

interface AdminPageState {
  mode: "paged" | "legacy";
  pageSize: number;
  returnedCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

interface AdminListError {
  code?: string;
  message?: string;
}

const adminPageSize = 25;

function legacyAdminPage(returnedCount: number): AdminPageState {
  return {
    mode: "legacy",
    pageSize: returnedCount,
    returnedCount,
    hasMore: false,
    nextCursor: null,
  };
}

function readAdminPage(value: unknown, returnedCount: number): AdminPageState {
  if (value === undefined) return legacyAdminPage(returnedCount);
  if (!value || typeof value !== "object") {
    throw new Error("The account service returned invalid pagination metadata.");
  }
  const candidate = value as Record<string, unknown>;
  const nextCursor = candidate.nextCursor;
  const validCursor =
    nextCursor === null ||
    (typeof nextCursor === "string" && nextCursor.length > 0);
  if (
    typeof candidate.pageSize !== "number" ||
    !Number.isSafeInteger(candidate.pageSize) ||
    candidate.pageSize < 1 ||
    candidate.pageSize > 100 ||
    typeof candidate.returnedCount !== "number" ||
    !Number.isSafeInteger(candidate.returnedCount) ||
    candidate.returnedCount < 0 ||
    candidate.returnedCount > candidate.pageSize ||
    candidate.returnedCount !== returnedCount ||
    typeof candidate.hasMore !== "boolean" ||
    !validCursor ||
    (candidate.hasMore && typeof nextCursor !== "string") ||
    (!candidate.hasMore && nextCursor !== null)
  ) {
    throw new Error("The account service returned invalid pagination metadata.");
  }
  return {
    mode: "paged",
    pageSize: candidate.pageSize,
    returnedCount: candidate.returnedCount,
    hasMore: candidate.hasMore,
    nextCursor,
  };
}

function appendUniqueById<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const known = new Set(current.map((item) => item.id));
  const result = [...current];
  for (const item of incoming) {
    if (known.has(item.id)) continue;
    known.add(item.id);
    result.push(item);
  }
  return result;
}

function adminListPath(
  resource: "accounts" | "audit" | "deletions",
  options: { cursor?: string; state?: AccountStateFilter } = {},
): string {
  const search = new URLSearchParams({ pageSize: String(adminPageSize) });
  if (options.state && options.state !== "all") {
    search.set("state", options.state);
  }
  if (options.cursor) search.set("cursor", options.cursor);
  return `/v1/admin/${resource}?${search.toString()}`;
}

const nextStates: Record<AccountState, AccountState[]> = {
  pending: ["approved", "rejected", "revoked"],
  approved: ["suspended", "revoked"],
  rejected: ["approved", "revoked"],
  suspended: ["approved", "revoked"],
  revoked: [],
};

type AccountStateFilter = AccountState | "all";

interface AccountStateAction {
  accountId: string;
  nextState: AccountState;
}

interface DomainRuleAction {
  kind: "enable" | "disable" | "remove";
  ruleId: string;
}

const accountStateFilters: AccountStateFilter[] = [
  "pending",
  "all",
  "approved",
  "rejected",
  "suspended",
  "revoked",
];

function accountLabel(account: Project42Account): string {
  return displayNameOrFallback(account.displayName, account.primaryEmail) ??
    `Account ${account.id.slice(0, 8)}`;
}

function displayNameOrFallback(
  displayName: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const candidate = displayName?.trim();
  if (candidate && !/^(unknown|undefined|null|anonymous)$/i.test(candidate)) {
    return candidate;
  }
  return fallback?.trim() || null;
}

function accountActionLabel(
  currentState: AccountState,
  nextState: AccountState,
): string {
  if (nextState === "approved" && currentState !== "pending") return "Restore access";
  if (nextState === "approved") return "Approve";
  if (nextState === "rejected") return "Reject";
  if (nextState === "suspended") return "Suspend";
  return "Revoke";
}

function useRetryCountdown(retryAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!retryAt || Date.parse(retryAt) <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  if (!retryAt) return 0;
  const parsed = Date.parse(retryAt);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.ceil((parsed - now) / 1_000))
    : 0;
}

function AccountExpectationLinks() {
  return (
    <p className="account-policy-note">
      Review{" "}
      <Link href="/learner-data">
        learner data, consent, retention, and recovery
      </Link>{" "}
      and the{" "}
      <Link href="/legal-transparency">
        Legal &amp; Transparency page
      </Link>{" "}
      before continuing. Hosted identity or record services may sometimes be
      unavailable.
    </p>
  );
}

function AccountRequestCard({
  signIn,
}: {
  signIn: (returnPath?: string) => Promise<void>;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const termsStorageKey = "project42.terms-acceptance.v1";

  function handleRequestAccount() {
    sessionStorage.setItem(
      termsStorageKey,
      JSON.stringify({
        termsVersion: "1.0",
        acceptedAt: new Date().toISOString(),
      }),
    );
    // So this browser can still tell "I asked and the answer landed" from "I
    // never asked" after an owner decision revokes the receipt.
    rememberRegistrationRequest();
    void signIn("/account");
  }

  const text = copy.account.request;
  return (
    // id="request-account" is the header's "Request access" target. It is on
    // the section rather than on the terms checkbox it used to sit on, so the
    // reader lands on the heading and the explanation instead of halfway down
    // a card whose first paragraph they never see.
    <section
      className="profile-card account-card registration-card"
      aria-labelledby="request-access-title"
      id="request-account"
    >
      <p className="eyebrow">{text.eyebrow}</p>
      <h2 id="request-access-title">{text.title}</h2>
      <p>{text.intro}</p>
      <h3 className="registration-subheading">
        {text.whatHappensNextHeading}
      </h3>
      <ol className="registration-expectations">
        {text.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h3 className="registration-subheading">{text.waitTimeHeading}</h3>
      <p>{text.waitTime}</p>
      <h3 className="registration-subheading">{text.howYouAreToldHeading}</h3>
      <p>{text.howYouAreTold}</p>
      <div className="terms-acceptance-field">
        <label className="terms-acceptance-label">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
          />
          <span>{text.termsLabel}</span>
        </label>
      </div>
      <AccountExpectationLinks />
      <div className="button-row">
        <button
          className="button button-primary"
          disabled={!termsAccepted}
          onClick={handleRequestAccount}
          type="button"
        >
          {text.submitLabel}
        </button>
      </div>
    </section>
  );
}

function RegistrationStatusCard({
  registration,
  refreshRegistration,
  signIn,
  signOut,
}: {
  registration: RegistrationExperience;
  refreshRegistration: () => Promise<void>;
  signIn: (returnPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const { formatDateTime } = useProfilePreferences();
  const retrySeconds = useRetryCountdown(registration.retryAt);
  const checking = registration.phase === "checking";
  const receipt = registration.receipt;

  if (checking && !receipt) {
    return (
      <section
        className="profile-card account-card registration-card"
        aria-labelledby="registration-check-title"
        aria-live="polite"
      >
        <p className="eyebrow">Private request receipt</p>
        <h2 id="registration-check-title">Checking your access request…</h2>
        <p>
          {orgName} is reading only the status attached to this browser’s
          HttpOnly receipt.
        </p>
      </section>
    );
  }

  if (receipt) {
    const pending = receipt.state === "pending";
    const approved = receipt.state === "approved";
    // Every state the server can report needs its own accurate wording.
    // Collapsing suspended and revoked into the rejected copy would tell a
    // learner their request was never approved when in fact access existed and
    // was withdrawn, which is both wrong and unactionable (AB#5780).
    const title = pending
      ? "Your access request is waiting for review"
      : approved
        ? "Your access is ready"
        : receipt.state === "suspended"
          ? "Your access is temporarily suspended"
          : receipt.state === "revoked"
            ? "Your access has been withdrawn"
            : "Your access request was not approved";
    return (
      <section
        className="profile-card account-card registration-card"
        aria-labelledby="registration-status-title"
      >
        <p className="eyebrow">Private request receipt</p>
        <div className="account-heading">
          <div>
            <h2 id="registration-status-title">{title}</h2>
            <p>
              This page intentionally shows no name, email address, identity
              provider, subject identifier, or learner record.
            </p>
          </div>
          <span className={`account-state account-state-${receipt.state}`}>
            {receipt.state}
          </span>
        </div>
        <dl className="registration-status-grid">
          <div>
            <dt>Requested</dt>
            <dd>
              <time dateTime={receipt.requestedAt}>
                {formatDateTime(receipt.requestedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Last status change</dt>
            <dd>
              <time dateTime={receipt.updatedAt}>
                {formatDateTime(receipt.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
        {pending ? (
          <p className="registration-notice" role="status">
            No hosted learner session exists yet. You may browse the public
            catalog while the owner reviews the request, but module participation
            requires an approved account and a new secure sign-in. {orgName}{" "}
            does not poll automatically.
          </p>
        ) : null}
        {receipt.state === "rejected" ? (
          <p className="registration-notice" role="status">
            This receipt does not expose a private review reason. Use the
            deployment’s published support path if you believe the decision
            should be reconsidered.
          </p>
        ) : null}
        {approved ? (
          <p className="registration-notice" role="status">
            Start a new sign-in to create the approved secure learner session.
            The private request receipt cannot authorize learner data.
          </p>
        ) : null}
        <AccountExpectationLinks />
        <div className="button-row">
          {approved ? (
            <button
              className="button button-primary"
              onClick={() => void signIn("/account")}
              type="button"
            >
              Sign in to continue
            </button>
          ) : (
            <button
              className="button button-primary"
              disabled={checking || retrySeconds > 0}
              onClick={() => void refreshRegistration()}
              type="button"
            >
              {checking
                ? "Checking request status…"
                : retrySeconds > 0
                  ? `Check again in ${retrySeconds} seconds`
                  : "Check request status"}
            </button>
          )}
          <Link className="button button-secondary" href="/learn/paths">
            Browse the learning catalog
          </Link>
          {/*
            A pending or rejected browser holds only the receipt and has no
            session, so it never reached the signed-in card that carries the
            sign-out control. Without this the browser is stuck on the receipt
            with no way to test another account or hand the device back.
          */}
          <button
            className="button button-secondary"
            onClick={() => void signOut()}
            type="button"
          >
            Clear this request on this browser
          </button>
        </div>
      </section>
    );
  }

  let content: { title: string; detail: string; action: string };
  switch (registration.phase) {
    case "expired":
      content = {
        title: "This private request receipt is no longer valid",
        detail:
          "It may have expired, been replaced, or been invalidated after an owner decision. That does not reveal whether access was approved.",
        action: "Sign in to check access",
      };
      break;
    case "provider-error":
      content = {
        title: "The identity provider did not complete the request",
        detail:
          "No learner session was created and no account progress was changed. Start again when you are ready.",
        action: "Try the identity provider again",
      };
      break;
    case "account-unavailable":
      content = {
        title: "Hosted account access is unavailable",
        detail:
          `${orgName} cannot issue a learner session or private status receipt for this account. Use the deployment’s published support path before trying again.`,
        action: "Try sign-in again",
      };
      break;
    case "temporarily-unavailable":
      content = {
        title: "Request status is temporarily unavailable",
        detail:
          "The service did not disclose account details. Wait for the retry window, then check the private receipt again.",
        action: "Check request status",
      };
      break;
    default:
      return null;
  }
  const retrying = registration.phase === "temporarily-unavailable";
  return (
    <section
      className="profile-card account-card registration-card"
      aria-labelledby="registration-recovery-title"
    >
      <p className="eyebrow">Account request</p>
      <h2 id="registration-recovery-title">{content.title}</h2>
      <p className="registration-notice" role="alert">
        {content.detail}
      </p>
      <AccountExpectationLinks />
      <div className="button-row">
        <button
          className="button button-primary"
          disabled={retrying && retrySeconds > 0}
          onClick={() =>
            void (retrying ? refreshRegistration() : signIn("/account"))
          }
          type="button"
        >
          {retrying && retrySeconds > 0
            ? `Try again in ${retrySeconds} seconds`
            : content.action}
        </button>
        <Link className="button button-secondary" href="/learn/paths">
          Browse the learning catalog
        </Link>
      </div>
    </section>
  );
}

export function AccountDashboard() {
  const {
    configured,
    status,
    account,
    registration,
    error,
    signIn,
    signOut,
    refreshRegistration,
    refreshAccount,
  } = useAuth();

  if (!configured) {
    return (
      <div className="account-dashboard">
        <section className="profile-card account-card">
          <p className="eyebrow">Account service</p>
          <h2>Ready for hosted identity configuration</h2>
          <p>
            Account code is installed, but this deployment has not yet been connected
            to its OIDC tenant and API. Account-backed learning is unavailable until
            that connection is configured.
          </p>
          <p>
            Review <Link href="/learner-data">learner-data and recovery controls</Link>
            {" "}and the{" "}
            <Link href="/legal-transparency">
              Legal &amp; Transparency page
            </Link>
            . Hosted sign-in and records may be temporarily unavailable even after
            configuration.
          </p>
        </section>
        <ProfilePreferencesEditor hosted={false} />
      </div>
    );
  }

  if (status === "loading" || status === "signing-in") {
    return (
      <div className="profile-loading" role="status" aria-live="polite">
        {status === "signing-in"
          ? "Opening the configured identity provider…"
          : `Loading your ${orgName} account…`}
      </div>
    );
  }

  if (status === "signed-out") {
    // Order matters here, and it used to be the other way round. A signed-out
    // visitor who arrives on this page is far more likely to be somebody
    // without an account than somebody with one -- an approved learner keeps a
    // session -- and the owner's report was that finding the request took a
    // while. So the request (or the status of one already made) comes first,
    // and "already have an account?" sits underneath it.
    return (
      <div className="account-dashboard">
        {registration.phase === "none" ? (
          <AccountRequestCard signIn={signIn} />
        ) : (
          <RegistrationStatusCard
            refreshRegistration={refreshRegistration}
            registration={registration}
            signIn={signIn}
            signOut={signOut}
          />
        )}
        <section
          className="profile-card account-card"
          aria-labelledby="sign-in-title"
        >
          <p className="eyebrow">{copy.account.signIn.eyebrow}</p>
          <h2 id="sign-in-title">{copy.account.signIn.title}</h2>
          <p>{copy.account.signIn.body}</p>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => void signIn("/account")}
              type="button"
            >
              {copy.account.signIn.submitLabel}
            </button>
            <Link className="button button-secondary" href="/learn/paths">
              {copy.account.signIn.browseLabel}
            </Link>
          </div>
        </section>
        <ProfilePreferencesEditor hosted={false} />
      </div>
    );
  }

  if (status === "error" || !account) {
    return (
      <div className="account-dashboard">
        <section className="profile-card account-card" role="alert">
          <p className="eyebrow">Account service</p>
          <h2>Account sign-in needs attention</h2>
          <p>{error ?? "The account could not be loaded."}</p>
          <p>
            No account progress was changed. See{" "}
            <Link href="/learner-data">learner-data and recovery expectations</Link>
            {" "}or{" "}
            <Link href="/legal-transparency#service-title">
              service limitations
            </Link>
            .
          </p>
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => void refreshAccount()}
              type="button"
            >
              Try again
            </button>
            <button
              className="button button-secondary"
              onClick={() => void signOut()}
              type="button"
            >
              Clear this sign-in
            </button>
          </div>
        </section>
        <ProfilePreferencesEditor hosted={false} />
      </div>
    );
  }

  return (
    <div className="account-dashboard">
      <section className="profile-card account-card">
        <p className="eyebrow">{orgName} account</p>
        <div className="account-heading">
          <div>
            <h2>
              {displayNameOrFallback(account.displayName, account.primaryEmail) ??
                `${orgName} learner`}
            </h2>
            <p>{account.primaryEmail ?? "No verified email supplied"}</p>
          </div>
          {/*
            The badge rendered a bare token with no context, so a screen reader
            announced only "pending" with nothing to attach it to (AB#5780).
          */}
          <span
            className={`account-state account-state-${account.state}`}
            aria-label={`Account state: ${account.state}`}
          >
            {account.state}
          </span>
        </div>
        {/*
          Account state can change while this page is open - an owner approving,
          suspending, or revoking takes effect on the next request - so the
          explanation is a live region rather than silent text.
        */}
        <div aria-live="polite" role="status">
          {account.state === "pending" ? (
            <p>
              Your request is waiting for owner approval. Course participation and
              account progress remain unavailable until approval.
            </p>
          ) : null}
          {account.state === "rejected" ? (
            <p>
              This registration request was rejected. An owner can reconsider the
              request without using permanent revocation.
            </p>
          ) : null}
          {account.state === "suspended" ? (
            <p>
              This account is suspended. Server progress is preserved but cannot be
              read or changed until an owner restores access.
            </p>
          ) : null}
          {account.state === "revoked" ? (
            <p>
              This account is revoked. Revocation is permanent for this identity
              binding; contact the deployment owner if you believe this is an error.
            </p>
          ) : null}
          {account.state === "approved" ? (
            <p>
              Your account is approved. Learn can synchronize progress, scores,
              transcript entries, and badges with the server.
            </p>
          ) : null}
        </div>
        <button
          className="button button-secondary"
          onClick={() => void signOut()}
          type="button"
        >
          Sign out on this browser
        </button>
        {account.roles.includes("owner") ? (
          <a className="button button-primary" href={clientCrossDomainHref("/admin")}>
            Open owner console
          </a>
        ) : null}
      </section>
      {account.state !== "suspended" && account.state !== "revoked" ? (
        <ProfileEditor />
      ) : null}
      <ProfilePreferencesEditor hosted={account.state === "approved"} />
      <LearnerDataControls />
    </div>
  );
}

export function DeletionStatusLookup() {
  const { apiFetch, configured } = useAuth();
  const { formatDateTime } = useProfilePreferences();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [message, setMessage] = useState(
    "Use the private receipt saved when deletion was requested. The token is submitted directly and is not retained by this page.",
  );
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const requestId = String(values.get("requestId") ?? "").trim();
    const statusToken = String(values.get("statusToken") ?? "").trim();
    form.reset();
    setStatus(null);
    setBusy(true);
    try {
      const response = await apiFetch("/v1/deletion-status", {
        method: "POST",
        body: JSON.stringify({ requestId, statusToken }),
      });
      const body = (await response.json()) as {
        status?: DeletionStatus;
      };
      if (!response.ok || !body.status) throw new Error("status_lookup_failed");
      setStatus(body.status);
      setHasError(false);
      setMessage("Deletion status verified from the private receipt.");
    } catch {
      setHasError(true);
      setMessage(
        "The receipt could not be verified. Check both values and try again; no account details were disclosed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="profile-card deletion-status-lookup"
      aria-labelledby="deletion-status-lookup-title"
    >
      <p className="eyebrow">After account deletion</p>
      <h2 id="deletion-status-lookup-title">Check a deletion request</h2>
      <p>
        This receipt-based check works without signing in, including after the
        learner account has been removed. It cannot search by email, name, or
        account identifier.
      </p>
      <p className="admin-status" role={hasError ? "alert" : "status"}>
        {configured
          ? message
          : "Deletion-status lookup becomes available when the hosted account API is configured."}
      </p>
      {configured ? (
        <form
          autoComplete="off"
          className="account-profile-form"
          onSubmit={(event) => void lookup(event)}
        >
          <label htmlFor="deletion-lookup-request-id">Request ID</label>
          <input
            id="deletion-lookup-request-id"
            name="requestId"
            required
            spellCheck={false}
          />
          <label htmlFor="deletion-lookup-status-token">
            Private status token
          </label>
          <input
            id="deletion-lookup-status-token"
            name="statusToken"
            required
            spellCheck={false}
            type="password"
          />
          <button className="button button-secondary" disabled={busy} type="submit">
            Check deletion status
          </button>
        </form>
      ) : null}
      {status ? (
        <dl className="deletion-status-result" aria-live="polite">
          <div>
            <dt>Status</dt>
            <dd>{status.state}</dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>
              <time dateTime={status.requestedAt}>
                {formatDateTime(status.requestedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Cancellation deadline</dt>
            <dd>
              <time dateTime={status.cancellationDeadline}>
                {formatDateTime(status.cancellationDeadline)}
              </time>
            </dd>
          </div>
          {status.completedAt ? (
            <div>
              <dt>Completed</dt>
              <dd>
                <time dateTime={status.completedAt}>
                  {formatDateTime(status.completedAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

export function LinkedIdentityEditor() {
  const { apiFetch, startGithubLink } = useAuth();
  const [identities, setIdentities] = useState<LinkedIdentity[]>([]);
  const [message, setMessage] = useState("Loading linked accounts…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/identities");
      const body = (await response.json()) as {
        identities?: LinkedIdentity[];
        error?: { message?: string };
      };
      if (!response.ok || !body.identities) {
        throw new Error(
          body.error?.message ?? "Linked accounts could not be loaded.",
        );
      }
      setIdentities(body.identities);
      setMessage("Linked accounts are current.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Linked accounts could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectGithub() {
    setBusy(true);
    setMessage("Opening GitHub’s secure authorization page…");
    try {
      await startGithubLink("/account?linked=github");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "GitHub account linking could not be started.",
      );
      setBusy(false);
    }
  }

  async function unlink(identity: LinkedIdentity) {
    const label = identity.providerLogin
      ? `@${identity.providerLogin}`
      : identity.displayName ?? identity.provider;
    if (
      !window.confirm(
        `Unlink ${label}? Your ${orgName} learning record will remain intact.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(
        `/v1/me/identities/${encodeURIComponent(identity.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message ?? "The linked account could not be removed.",
        );
      }
      await load();
      setMessage(`${label} was unlinked.`);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "The linked account could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const githubLinked = identities.some(
    (identity) => identity.provider === "github" && identity.status === "active",
  );

  return (
    <section className="profile-card" aria-labelledby="linked-identities-title">
      <p className="eyebrow">Linked accounts</p>
      <h3 id="linked-identities-title">Sign-in and contributor identity</h3>
      <p>
        Link GitHub to your existing {orgName} learner record without changing
        your primary sign-in. Repository permissions are never requested.
      </p>
      <p className="admin-status" role="status">
        {message}
      </p>
      <div className="linked-identity-list">
        {identities.map((identity) => (
          <article key={identity.id}>
            <div>
              <strong>
                {identity.provider === "github"
                  ? "GitHub"
                  : identity.provider === "oidc"
                    ? "Primary identity provider"
                    : identity.provider}
              </strong>
              <span>
                {identity.providerLogin
                  ? `@${identity.providerLogin}`
                  : identity.displayName ?? "Verified identity"}
              </span>
              {/*
                AB#6230 requires the profile to show when each identity was
                linked and last used, so a learner can recognise an unfamiliar
                or stale sign-in method before deciding to unlink it.
              */}
              <small>
                Linked {new Date(identity.linkedAt).toLocaleDateString()}
                {" · "}
                Last used {new Date(identity.lastSeenAt).toLocaleDateString()}
                {" · "}
                Last verified{" "}
                {new Date(identity.lastVerifiedAt).toLocaleDateString()}
              </small>
            </div>
            <div className="linked-identity-actions">
              <span className="account-state">
                {identity.primary ? "Primary" : "Linked"}
              </span>
              {identity.canUnlink ? (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void unlink(identity)}
                  type="button"
                >
                  Unlink
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!githubLinked ? (
        <button
          className="button button-primary"
          disabled={busy}
          onClick={() => void connectGithub()}
          type="button"
        >
          Connect GitHub
        </button>
      ) : null}
    </section>
  );
}

function ProfileEditor() {
  const { apiFetch, refreshAccount } = useAuth();
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [message, setMessage] = useState("Loading profile…");
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/profile");
      const body = (await response.json()) as {
        profile?: LearnerProfile;
      };
      if (!response.ok || !body.profile) {
        throw new Error("profile_load_failed");
      }
      setProfile(body.profile);
      setHasError(false);
      setMessage("Profile is current.");
    } catch {
      setHasError(true);
      setMessage(
        "Your profile could not be loaded. No account progress was changed.",
      );
    } finally {
      setBusy(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: String(form.get("displayName") ?? ""),
          bio: String(form.get("bio") ?? ""),
          organization: String(form.get("organization") ?? ""),
          location: String(form.get("location") ?? ""),
          websiteUrl: String(form.get("websiteUrl") ?? ""),
        }),
      });
      const body = (await response.json()) as {
        profile?: LearnerProfile;
      };
      if (!response.ok || !body.profile) {
        throw new Error("profile_save_failed");
      }
      setProfile(body.profile);
      setHasError(false);
      setMessage("Profile saved.");
      await refreshAccount();
    } catch {
      setHasError(true);
      setMessage(
        "Your profile could not be saved. No local learning progress was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-card" aria-labelledby="hosted-profile-title">
      <p className="eyebrow">Hosted profile</p>
      <h3 id="hosted-profile-title">How you appear in {orgName}</h3>
      <p>
        These details are stored with your {orgName} account. Your verified email
        remains controlled by your identity provider.
      </p>
      <p className="admin-status" role={hasError ? "alert" : "status"}>
        {message}
      </p>
      {profile ? (
        <>
          <form className="account-profile-form" key={profile.updatedAt} onSubmit={saveProfile}>
            <label htmlFor="profile-display-name">Display name</label>
            <input
              defaultValue={profile.displayName ?? ""}
              id="profile-display-name"
              maxLength={80}
              name="displayName"
            />
            <label htmlFor="profile-organization">Organization</label>
            <input
              defaultValue={profile.organization ?? ""}
              id="profile-organization"
              maxLength={120}
              name="organization"
            />
            <label htmlFor="profile-location">Location</label>
            <input
              defaultValue={profile.location ?? ""}
              id="profile-location"
              maxLength={120}
              name="location"
            />
            <label htmlFor="profile-website">Website</label>
            <input
              defaultValue={profile.websiteUrl ?? ""}
              id="profile-website"
              inputMode="url"
              maxLength={2048}
              name="websiteUrl"
              placeholder="https://example.com"
              type="url"
            />
            <label htmlFor="profile-bio">About you</label>
            <textarea
              defaultValue={profile.bio ?? ""}
              id="profile-bio"
              maxLength={500}
              name="bio"
              rows={4}
            />
            <button className="button button-primary" disabled={busy} type="submit">
              Save profile
            </button>
          </form>
        </>
      ) : (
        <button className="button button-secondary" disabled={busy} onClick={() => void load()} type="button">
          Try loading profile again
        </button>
      )}
    </section>
  );
}

const commonLocales = [
  "en-US",
  "en-GB",
  "en-CA",
  "es-ES",
  "fr-FR",
  "de-DE",
  "hi-IN",
  "ja-JP",
  "ko-KR",
  "pt-BR",
  "zh-CN",
];

const commonTimeZones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function hostedPreferencesFromProfile(
  profile: LearnerProfile,
  fallback: ProfilePreferences,
): ProfilePreferences | null {
  const requiredFields = [
    "locale",
    "timeZone",
    "reducedMotion",
    "highContrast",
  ] as const;
  if (
    !requiredFields.every((field) =>
      Object.prototype.hasOwnProperty.call(profile, field),
    ) ||
    typeof profile.reducedMotion !== "boolean" ||
    typeof profile.highContrast !== "boolean"
  ) {
    return null;
  }
  return validateProfilePreferences({
    locale: profile.locale ?? fallback.locale,
    timeZone: profile.timeZone ?? fallback.timeZone,
    reducedMotion: profile.reducedMotion,
    highContrast: profile.highContrast,
  });
}

function browserPreferenceDefaults(): ProfilePreferences {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  return (
    validateProfilePreferences({
      locale: resolved.locale,
      timeZone: resolved.timeZone,
      reducedMotion: false,
      highContrast: false,
    }) ?? {
      locale: "en-US",
      timeZone: "UTC",
      reducedMotion: false,
      highContrast: false,
    }
  );
}

function ProfilePreferencesEditor({ hosted }: { hosted: boolean }) {
  const { apiFetch } = useAuth();
  const {
    preferences,
    ready,
    applySessionPreferences,
    savePreferences,
  } = useProfilePreferences();
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [hostedState, setHostedState] = useState<
    "browser" | "loading" | "ready" | "legacy" | "offline"
  >(hosted ? "loading" : "browser");
  const hostedLoadStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!hosted) {
        hostedLoadStarted.current = false;
        setHostedState("browser");
        return;
      }
      if (!ready || hostedLoadStarted.current) return;
      hostedLoadStarted.current = true;
      setHostedState("loading");
      void apiFetch("/v1/me/profile")
        .then(async (response) => {
          const body = (await response.json()) as { profile?: LearnerProfile };
          if (!response.ok || !body.profile) {
            throw new Error("profile_load_failed");
          }
          const hostedPreferences = hostedPreferencesFromProfile(
            body.profile,
            preferences,
          );
          if (cancelled) return;
          if (!hostedPreferences) {
            setHostedState("legacy");
            setHasError(false);
            return;
          }
          applySessionPreferences(hostedPreferences);
          setHostedState("ready");
          setHasError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setHostedState("offline");
          setHasError(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiFetch, applySessionPreferences, hosted, preferences, ready]);

  const displayedMessage =
    message ??
    (!ready || hostedState === "loading"
      ? "Loading your learning preferences…"
      : hostedState === "ready"
        ? "These preferences are synchronized with your approved account and applied to this browser session."
        : hostedState === "legacy"
          ? "The hosted account API does not yet expose preference fields. Changes apply to this browser session only until a compatible preference contract is deployed."
          : hostedState === "offline"
            ? "Hosted preferences could not be reached. Session-only preferences remain available and no account preference was changed."
            : "These preferences apply to this browser session until you sign in with an approved account.");

  async function persistPreferences(validated: ProfilePreferences) {
    if (hostedState === "ready") {
      try {
        const response = await apiFetch("/v1/me/profile", {
          method: "PATCH",
          body: JSON.stringify(validated),
        });
        const body = (await response.json()) as { profile?: LearnerProfile };
        const confirmed = body.profile
          ? hostedPreferencesFromProfile(body.profile, validated)
          : null;
        if (!response.ok || !confirmed) throw new Error("preference_save_failed");
        savePreferences(confirmed);
        setHasError(false);
        setMessage("Preferences saved to your account and applied to this session.");
        return;
      } catch {
        setHasError(true);
        setMessage(
          "Hosted preferences could not be saved. Your previous account preferences are unchanged.",
        );
        return;
      }
    }
    const result = savePreferences(validated);
    setHasError(!result.persisted);
    setMessage(
      result.persisted
        ? "Preferences applied to this browser session."
        : "Your preferences could not be applied.",
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const validated = validateProfilePreferences({
      locale: String(form.get("locale") ?? ""),
      timeZone: String(form.get("timeZone") ?? ""),
      reducedMotion: form.get("reducedMotion") === "on",
      highContrast: form.get("highContrast") === "on",
    });
    if (!validated) {
      setHasError(true);
      setMessage(
        "Enter a valid language tag, such as en-US, and an IANA time zone, such as America/New_York.",
      );
      return;
    }
    await persistPreferences(validated);
  }

  async function reset() {
    await persistPreferences(browserPreferenceDefaults());
  }

  return (
    <section className="profile-card" aria-labelledby="profile-preferences-title">
      <p className="eyebrow">Learning preferences</p>
      <h3 id="profile-preferences-title">Language, time, and accessibility</h3>
      <p>
        Choose how {orgName} formats dates and add accessibility preferences. An
        operating-system request for reduced motion, increased contrast, or forced
        colors always takes priority; these controls can add support but never turn
        system support off.
      </p>
      <p
        className="admin-status"
        role={hasError ? "alert" : "status"}
      >
        {displayedMessage}
      </p>
      <form
        className="account-profile-form account-preferences-form"
        key={`${preferences.locale}:${preferences.timeZone}:${preferences.reducedMotion}:${preferences.highContrast}`}
        onSubmit={(event) => void save(event)}
      >
        <label htmlFor="profile-locale">Language tag for dates and times</label>
        <input
          aria-describedby="profile-locale-help"
          defaultValue={preferences.locale}
          disabled={!ready}
          id="profile-locale"
          list="profile-locale-options"
          name="locale"
          required
        />
        <datalist id="profile-locale-options">
          {commonLocales.map((locale) => (
            <option key={locale} value={locale} />
          ))}
        </datalist>
        <small id="profile-locale-help">
          Use a BCP 47 language tag, such as en-US or fr-FR.
        </small>

        <label htmlFor="profile-time-zone">Time zone</label>
        <input
          aria-describedby="profile-time-zone-help"
          defaultValue={preferences.timeZone}
          disabled={!ready}
          id="profile-time-zone"
          list="profile-time-zone-options"
          name="timeZone"
          required
        />
        <datalist id="profile-time-zone-options">
          {commonTimeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone} />
          ))}
        </datalist>
        <small id="profile-time-zone-help">
          Use an IANA time zone, such as America/New_York or UTC.
        </small>

        <fieldset>
          <legend>Accessibility</legend>
          <label className="account-checkbox" htmlFor="profile-reduced-motion">
            <input
              defaultChecked={preferences.reducedMotion}
              disabled={!ready}
              id="profile-reduced-motion"
              name="reducedMotion"
              type="checkbox"
            />
            <span>
              <strong>Always reduce motion</strong>
              <small>
                Minimize animation and smooth scrolling even when the system has no
                reduced-motion preference.
              </small>
            </span>
          </label>
          <label className="account-checkbox" htmlFor="profile-high-contrast">
            <input
              defaultChecked={preferences.highContrast}
              disabled={!ready}
              id="profile-high-contrast"
              name="highContrast"
              type="checkbox"
            />
            <span>
              <strong>Increase contrast</strong>
              <small>
                Use stronger text and control boundaries without overriding forced
                colors.
              </small>
            </span>
          </label>
        </fieldset>
        <div className="button-row">
          <button className="button button-primary" disabled={!ready} type="submit">
            Save preferences
          </button>
          <button
            className="button button-secondary"
            disabled={!ready}
            onClick={() => void reset()}
            type="button"
          >
            Use browser defaults
          </button>
        </div>
      </form>
    </section>
  );
}

function LearnerDataControls() {
  const { apiFetch, signIn } = useAuth();
  const { formatDateTime } = useProfilePreferences();
  const [optionalConsents, setOptionalConsents] = useState<OptionalConsent[]>([
    { purpose: "product-improvement", decision: "withdrawn" },
    { purpose: "learning-reminders", decision: "withdrawn" },
  ]);
  const [deletions, setDeletions] = useState<DeletionRequest[]>([]);
  const [deletionReceipt, setDeletionReceipt] =
    useState<DeletionStatusReceipt | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Loading privacy controls…");
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [consentResponse, deletionResponse] = await Promise.all([
        apiFetch("/v1/me/consents"),
        apiFetch("/v1/me/deletion"),
      ]);
      const consentBody = (await consentResponse.json()) as {
        consents?: OptionalConsent[];
      };
      const deletionBody = (await deletionResponse.json()) as {
        requests?: DeletionRequest[];
      };
      if (!consentResponse.ok || !deletionResponse.ok) {
        throw new Error("privacy_controls_load_failed");
      }
      const serverConsents = consentBody.consents ?? [];
      setOptionalConsents((current) =>
        current.map((c) => {
          const server = serverConsents.find((s) => s.purpose === c.purpose);
          return server ?? c;
        }),
      );
      setDeletions(deletionBody.requests ?? []);
      setHasError(false);
      setMessage("Privacy controls are current.");
    } catch {
      setHasError(true);
      setMessage(
        "Privacy controls could not be loaded. No consent or deletion decision was changed.",
      );
    } finally {
      setBusy(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const orderedDeletions = [...deletions].sort(
    (left, right) =>
      Date.parse(right.requestedAt) - Date.parse(left.requestedAt) ||
      right.id.localeCompare(left.id),
  );
  const activeDeletion = orderedDeletions.find((request) =>
    ["requested", "processing"].includes(request.state),
  );

  async function toggleConsent(purpose: string, granted: boolean) {
    const decision = granted ? "granted" : "withdrawn";
    const previousDecision =
      optionalConsents.find((consent) => consent.purpose === purpose)?.decision ??
      "withdrawn";
    setOptionalConsents((current) =>
      current.map((consent) =>
        consent.purpose === purpose ? { ...consent, decision } : consent,
      ),
    );
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/consents", {
        method: "PATCH",
        body: JSON.stringify({ purpose, decision }),
      });
      if (!response.ok) {
        throw new Error("consent_write_failed");
      }
      setHasError(false);
      setMessage(
        granted
          ? `${purpose === "product-improvement" ? "Product improvement" : "Learning reminders"} consent granted.`
          : `${purpose === "product-improvement" ? "Product improvement" : "Learning reminders"} consent withdrawn.`,
      );
    } catch {
      setOptionalConsents((current) =>
        current.map((consent) =>
          consent.purpose === purpose
            ? { ...consent, decision: previousDecision }
            : consent,
        ),
      );
      setHasError(true);
      setMessage("Consent could not be updated. Your previous decision is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/export");
      const body = (await response.json()) as {
        export?: unknown;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.export) {
        if (body.error?.code === "recent_authentication_required") {
          setHasError(true);
          setMessage(
            "Sign out and sign in again before exporting this sensitive account data.",
          );
          return;
        }
        throw new Error("export_failed");
      }
      const blob = new Blob([JSON.stringify(body.export, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `project42-learner-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      setHasError(false);
      setMessage("Account and learner data export downloaded.");
    } catch {
      setHasError(true);
      setMessage(
        "Account data could not be exported. No public download link was created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/deletion", {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json()) as {
        deletionRequest?: DeletionRequest;
        receipt?: DeletionStatusReceipt;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.deletionRequest) {
        if (body.error?.code === "recent_authentication_required") {
          setHasError(true);
          setMessage(
            "Sign out and sign in again before requesting account deletion.",
          );
          return;
        }
        throw new Error("deletion_request_failed");
      }
      setDeletions((current) => [body.deletionRequest as DeletionRequest, ...current]);
      setDeletionReceipt(body.receipt ?? null);
      setConfirmation("");
      setHasError(false);
      setMessage(
        body.receipt
          ? `Deletion requested. Save the one-time private status receipt before leaving this page. Cancellation remains available until ${formatDateTime(
            body.deletionRequest.cancellationDeadline,
          )}.`
          : `Deletion requested. This account API did not return a private post-deletion status receipt. Cancellation remains available until ${formatDateTime(
            body.deletionRequest.cancellationDeadline,
          )}.`,
      );
    } catch {
      setHasError(true);
      setMessage(
        "Deletion could not be requested. Your account and learner record are unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeletion() {
    setBusy(true);
    try {
      const response = await apiFetch("/v1/me/deletion", { method: "DELETE" });
      const body = (await response.json()) as {
        deletionRequest?: DeletionRequest;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.deletionRequest) {
        if (body.error?.code === "recent_authentication_required") {
          setHasError(true);
          setMessage(
            "Sign out and sign in again before cancelling account deletion.",
          );
          return;
        }
        throw new Error("deletion_cancel_failed");
      }
      setDeletions((current) =>
        current.map((request) =>
          request.id === body.deletionRequest?.id
            ? (body.deletionRequest as DeletionRequest)
            : request,
        ),
      );
      setHasError(false);
      setMessage("Deletion request cancelled.");
    } catch {
      setHasError(true);
      setMessage(
        "Deletion could not be cancelled. Check the request status before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function reauthenticate() {
    void signIn("/account");
  }

  async function copyDeletionReceipt() {
    if (!deletionReceipt) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(deletionReceipt));
      setHasError(false);
      setMessage("Private deletion-status receipt copied. Store it securely.");
    } catch {
      setHasError(true);
      setMessage(
        "The browser could not copy the receipt. Use the visible values or download it instead.",
      );
    }
  }

  function downloadDeletionReceipt() {
    if (!deletionReceipt) return;
    const blob = new Blob([JSON.stringify(deletionReceipt, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `project42-deletion-status-${deletionReceipt.requestId}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setHasError(false);
    setMessage("Private deletion-status receipt downloaded.");
  }

  return (
    <section className="owner-console" aria-labelledby="learner-data-controls-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Privacy and portability</p>
          <h2 id="learner-data-controls-title">Your account and learner data</h2>
        </div>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void load()}
          type="button"
        >
          Refresh
        </button>
      </div>
      <p className="admin-status" role={hasError ? "alert" : "status"}>
        {message}
      </p>
      <p className="account-policy-note">
        These controls follow the current{" "}
        <Link href="/learner-data">learner-data policy</Link>. Optional consents
        are separate from the{" "}
        <Link href="/legal-transparency">
          Legal &amp; Transparency page
        </Link>
        ; neither is preselected.
      </p>
      <div className="admin-grid">
        <section className="profile-card">
          <h3>Optional consents</h3>
          <p>
            These are genuinely optional. Refusing either leaves every learning
            feature working.
          </p>
          <div className="account-consent-toggles">
            <label className="account-consent-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={optionalConsents.find((c) => c.purpose === "product-improvement")?.decision === "granted"}
                disabled={busy}
                onChange={(e) => void toggleConsent("product-improvement", e.target.checked)}
              />
              <span>Product improvement</span>
            </label>
            <label className="account-consent-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={optionalConsents.find((c) => c.purpose === "learning-reminders")?.decision === "granted"}
                disabled={busy}
                onChange={(e) => void toggleConsent("learning-reminders", e.target.checked)}
              />
              <span>Learning reminders</span>
            </label>
          </div>
          <h3>Export</h3>
          <div className="button-row">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void exportData()}
              type="button"
            >
              Download my data
            </button>
          </div>
          <p>
            Export and deletion require a sign-in issued within the last{" "}
            {learnerDataPolicy.export.recentAuthenticationMinutes} minutes. The
            export is returned directly to this browser; {orgName} does not create
            a public object URL.
          </p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={reauthenticate}
            type="button"
          >
            Sign in again
          </button>
        </section>

        <section className="profile-card">
          <h3>Delete account and learner data</h3>
          {deletionReceipt ? (
            <aside
              className="deletion-status-receipt"
              aria-labelledby="deletion-status-receipt-title"
            >
              <h4 id="deletion-status-receipt-title">
                Save your one-time private status receipt
              </h4>
              <p>
                This receipt is required to check status after the account is
                deleted. {orgName} does not place it in browser storage, a URL,
                analytics, or logs. It disappears from this page when you confirm
                that it is saved.
              </p>
              <label htmlFor="deletion-status-request-id">Request ID</label>
              <input
                id="deletion-status-request-id"
                readOnly
                value={deletionReceipt.requestId}
              />
              <label htmlFor="deletion-status-token">Private status token</label>
              <textarea
                id="deletion-status-token"
                readOnly
                rows={3}
                value={deletionReceipt.statusToken}
              />
              <p>
                Issued{" "}
                <time dateTime={deletionReceipt.issuedAt}>
                  {formatDateTime(deletionReceipt.issuedAt)}
                </time>
              </p>
              <div className="button-row">
                <button
                  className="button button-secondary"
                  onClick={() => void copyDeletionReceipt()}
                  type="button"
                >
                  Copy private receipt
                </button>
                <button
                  className="button button-secondary"
                  onClick={downloadDeletionReceipt}
                  type="button"
                >
                  Download private receipt
                </button>
                <button
                  className="button button-primary"
                  onClick={() => setDeletionReceipt(null)}
                  type="button"
                >
                  I saved this receipt
                </button>
              </div>
            </aside>
          ) : null}
          {activeDeletion ? (
            <>
              <p>
                Deletion is {activeDeletion.state}. You can cancel until{" "}
                <time dateTime={activeDeletion.cancellationDeadline}>
                  {formatDateTime(activeDeletion.cancellationDeadline)}
                </time>
                .
              </p>
              <button
                className="button button-secondary"
                disabled={busy || activeDeletion.state !== "requested"}
                onClick={() => void cancelDeletion()}
                type="button"
              >
                Cancel deletion
              </button>
            </>
          ) : (
            <form className="domain-form" onSubmit={(event) => void requestDeletion(event)}>
              <p>
                This removes the account, progress, attempts, transcript, badges, and
                consent history after a{" "}
                {learnerDataPolicy.deletion.cancellationWindowDays}-day cancellation
                period. A minimized audit tombstone remains.
              </p>
              <label htmlFor="deletion-confirmation">
                Enter DELETE MY PROJECT 42 ACCOUNT
              </label>
              <input
                autoComplete="off"
                id="deletion-confirmation"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                value={confirmation}
              />
              <button
                className="button button-primary"
                disabled={busy || confirmation !== "DELETE MY PROJECT 42 ACCOUNT"}
                type="submit"
              >
                Request deletion
              </button>
            </form>
          )}
          <div className="account-history">
            <h4>Deletion request history</h4>
            {orderedDeletions.length === 0 ? (
              <p>No deletion request has been recorded.</p>
            ) : (
              <ol className="deletion-history">
                {orderedDeletions.map((request) => (
                  <li key={request.id}>
                    <div>
                      <strong>{request.state}</strong>
                      <span>
                        Requested{" "}
                        <time dateTime={request.requestedAt}>
                          {formatDateTime(request.requestedAt)}
                        </time>
                      </span>
                      {request.completedAt ? (
                        <span>
                          Completed{" "}
                          <time dateTime={request.completedAt}>
                            {formatDateTime(request.completedAt)}
                          </time>
                        </span>
                      ) : (
                        <span>
                          Cancellation deadline{" "}
                          <time dateTime={request.cancellationDeadline}>
                            {formatDateTime(request.cancellationDeadline)}
                          </time>
                        </span>
                      )}
                    </div>
                    <code aria-label={`Deletion request identifier ${request.id}`}>
                      Request {request.id}
                    </code>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export function AdminDashboard({
  view = "accounts",
}: {
  view?: "accounts" | "logs" | "settings";
} = {}) {
  const {
    configured,
    status,
    account,
    error,
    signIn,
    signOut,
    refreshAccount,
  } = useAuth();

  if (!configured) {
    return (
      <section className="profile-card account-card">
        <p className="eyebrow">Owner administration</p>
        <h2>Hosted identity is not configured</h2>
        <p>The owner console requires a configured OIDC provider and account API.</p>
      </section>
    );
  }

  if (status === "loading" || status === "signing-in") {
    return <div className="profile-loading">Checking owner access…</div>;
  }

  if (status === "signed-out") {
    return (
      <section className="profile-card account-card">
        <p className="eyebrow">Owner administration</p>
        <h2>Sign in with an approved owner account</h2>
        <p>
          Administrative data is loaded only after the account service confirms an
          approved owner role.
        </p>
        <button
          className="button button-primary"
          onClick={() => void signIn("/admin")}
          type="button"
        >
          Sign in to owner console
        </button>
      </section>
    );
  }

  if (status === "error" || !account) {
    return (
      <section className="profile-card account-card" role="alert">
        <p className="eyebrow">Owner administration</p>
        <h2>Owner access could not be verified</h2>
        <p>{error ?? "The account could not be loaded."}</p>
        <div className="button-row">
          <button
            className="button button-primary"
            onClick={() => void refreshAccount()}
            type="button"
          >
            Try again
          </button>
          <button
            className="button button-secondary"
            onClick={() => void signOut()}
            type="button"
          >
            Clear this sign-in
          </button>
        </div>
      </section>
    );
  }

  if (account.state !== "approved" || !account.roles.includes("owner")) {
    return (
      <section className="profile-card account-card" role="alert">
        <p className="eyebrow">Owner administration</p>
        <h2>Owner access required</h2>
        <p>
          This account is not an approved {orgName} owner. No administrative data
          has been requested or displayed.
        </p>
        <a className="button button-secondary" href={clientCrossDomainHref("/account")}>
          Return to my account
        </a>
      </section>
    );
  }

  return <OwnerAdministration view={view} />;
}

export function OwnerAdministration({
  view = "accounts",
}: {
  view?: "accounts" | "logs" | "settings";
} = {}) {
  const { account: ownerAccount, apiFetch } = useAuth();
  const [accounts, setAccounts] = useState<Project42Account[]>([]);
  const [accountPage, setAccountPage] = useState<AdminPageState>(
    legacyAdminPage(0),
  );
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsStale, setAccountsStale] = useState(false);
  const [accountAnnouncement, setAccountAnnouncement] = useState("");
  const [accountStateFilter, setAccountStateFilter] =
    useState<AccountStateFilter>("pending");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountAction, setAccountAction] = useState<AccountStateAction | null>(
    null,
  );
  const [accountActionReason, setAccountActionReason] = useState("");
  // AB#5696: an owner deciding a request needs the request's own detail, not
  // just the queue summary row.
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [accountActionConfirmation, setAccountActionConfirmation] = useState("");
  const [domains, setDomains] = useState<DomainRule[]>([]);
  const [domainAction, setDomainAction] = useState<DomainRuleAction | null>(null);
  const [domainActionReason, setDomainActionReason] = useState("");
  const [automaticDomainApprovalEnabled, setAutomaticDomainApprovalEnabled] =
    useState(false);
  const [deletionRequests, setDeletionRequests] = useState<OwnerDeletionRequest[]>([]);
  const [deletionActionId, setDeletionActionId] = useState<string | null>(null);
  const [deletionActionReason, setDeletionActionReason] = useState("");
  const [deletionActionConfirmation, setDeletionActionConfirmation] = useState("");
  const [deletionPage, setDeletionPage] = useState<AdminPageState>(
    legacyAdminPage(0),
  );
  const [deletionsLoading, setDeletionsLoading] = useState(true);
  const [deletionsStale, setDeletionsStale] = useState(false);
  const [deletionAnnouncement, setDeletionAnnouncement] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditPage, setAuditPage] = useState<AdminPageState>(
    legacyAdminPage(0),
  );
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditStale, setAuditStale] = useState(false);
  const [auditAnnouncement, setAuditAnnouncement] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [message, setMessage] = useState("Loading owner controls…");
  const [busy, setBusy] = useState(false);
  const accountActionHeading = useRef<HTMLHeadingElement>(null);
  const domainActionHeading = useRef<HTMLHeadingElement>(null);
  const deletionActionHeading = useRef<HTMLHeadingElement>(null);
  const accountPaginationStatus = useRef<HTMLParagraphElement>(null);
  const auditPaginationStatus = useRef<HTMLParagraphElement>(null);
  const deletionPaginationStatus = useRef<HTMLParagraphElement>(null);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLocaleLowerCase();
    return accounts.filter((candidate) => {
      if (
        accountStateFilter !== "all" &&
        candidate.state !== accountStateFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [
        candidate.displayName,
        candidate.primaryEmail,
        candidate.id,
        candidate.state,
        ...candidate.roles,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [accountSearch, accountStateFilter, accounts]);

  const selectedAccount = accountAction
    ? accounts.find((candidate) => candidate.id === accountAction.accountId) ?? null
    : null;
  const selectedDomain = domainAction
    ? domains.find((candidate) => candidate.id === domainAction.ruleId) ?? null
    : null;
  const selectedDeletionRequest = deletionActionId
    ? deletionRequests.find((candidate) => candidate.id === deletionActionId) ?? null
    : null;

  useEffect(() => {
    if (accountAction) accountActionHeading.current?.focus();
  }, [accountAction]);

  useEffect(() => {
    if (domainAction) domainActionHeading.current?.focus();
  }, [domainAction]);

  useEffect(() => {
    if (deletionActionId) deletionActionHeading.current?.focus();
  }, [deletionActionId]);

  const load = useCallback(async () => {
    if (!ownerAccount?.id) return;
    setBusy(true);
    setAccountsLoading(true);
    setAuditLoading(true);
    setAccountsStale(false);
    setAuditStale(false);
    setDeletionsStale(false);
    setAccountAnnouncement("");
    setAuditAnnouncement("");
    setDeletionAnnouncement("");
    setDeletionsLoading(true);
    try {
      const [accountResponse, domainResponse, deletionResponse, auditResponse] =
        await Promise.all([
          apiFetch(
            adminListPath("accounts", {
              state: accountStateFilter,
            }),
          ),
          apiFetch("/v1/admin/domains"),
          apiFetch(adminListPath("deletions")),
          apiFetch(adminListPath("audit")),
        ]);
      const accountBody = (await accountResponse.json()) as {
        accounts?: Project42Account[];
        page?: unknown;
        error?: AdminListError;
      };
      const domainBody = (await domainResponse.json()) as {
        domains?: DomainRule[];
        automaticApprovalEnabled?: boolean;
        error?: { message?: string };
      };
      const deletionBody = (await deletionResponse.json()) as {
        requests?: OwnerDeletionRequest[];
        page?: unknown;
        error?: AdminListError;
      };
      const auditBody = (await auditResponse.json()) as {
        events?: AuditEvent[];
        page?: unknown;
        error?: AdminListError;
      };
      if (
        !accountResponse.ok ||
        !domainResponse.ok ||
        !deletionResponse.ok ||
        !auditResponse.ok
      ) {
        throw new Error(
          accountBody.error?.message ??
          domainBody.error?.message ??
          deletionBody.error?.message ??
          auditBody.error?.message ??
          "Owner data could not be loaded.",
        );
      }
      const nextAccounts = accountBody.accounts ?? [];
      const nextAuditEvents = auditBody.events ?? [];
      const nextAccountPage = readAdminPage(
        accountBody.page,
        nextAccounts.length,
      );
      const nextAuditPage = readAdminPage(
        auditBody.page,
        nextAuditEvents.length,
      );
      setAccounts(nextAccounts);
      setAccountPage(nextAccountPage);
      setDomains(domainBody.domains ?? []);
      setAutomaticDomainApprovalEnabled(
        domainBody.automaticApprovalEnabled === true,
      );
      const nextDeletionRequests = deletionBody.requests ?? [];
      setDeletionRequests(nextDeletionRequests);
      setDeletionPage(
        readAdminPage(deletionBody.page, nextDeletionRequests.length),
      );
      setAuditEvents(nextAuditEvents);
      setAuditPage(nextAuditPage);
      setLoadedAt(Date.now());
      setMessage("Owner data is current.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Owner data could not be loaded.");
    } finally {
      setAccountsLoading(false);
      setAuditLoading(false);
      setDeletionsLoading(false);
      setBusy(false);
    }
  }, [accountStateFilter, apiFetch, ownerAccount?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function loadMoreAccounts() {
    const cursor = accountPage.nextCursor;
    if (!cursor || accountsLoading) return;
    setAccountsLoading(true);
    setAccountsStale(false);
    setAccountAnnouncement("Loading more accounts…");
    try {
      const response = await apiFetch(
        adminListPath("accounts", {
          cursor,
          state: accountStateFilter,
        }),
      );
      const body = (await response.json()) as {
        accounts?: Project42Account[];
        page?: unknown;
        error?: AdminListError;
      };
      if (!response.ok) {
        if (body.error?.code === "invalid_admin_cursor") {
          setAccountsStale(true);
          setAccountPage((current) => ({
            ...current,
            hasMore: false,
            nextCursor: null,
          }));
          setAccountAnnouncement(
            "The account results changed. Reload from the first page before continuing.",
          );
          window.requestAnimationFrame(() =>
            accountPaginationStatus.current?.focus(),
          );
          return;
        }
        throw new Error(
          body.error?.message ?? "More accounts could not be loaded.",
        );
      }
      const nextAccounts = body.accounts ?? [];
      const nextPage = readAdminPage(body.page, nextAccounts.length);
      const combinedAccounts = appendUniqueById(accounts, nextAccounts);
      const addedAccounts = combinedAccounts.length - accounts.length;
      setAccounts(combinedAccounts);
      setAccountPage(nextPage);
      setAccountAnnouncement(
        `Loaded ${addedAccounts} more account${addedAccounts === 1 ? "" : "s"
        }. ${combinedAccounts.length} total loaded.`,
      );
      window.requestAnimationFrame(() =>
        accountPaginationStatus.current?.focus(),
      );
    } catch (caught) {
      setAccountAnnouncement(
        caught instanceof Error
          ? caught.message
          : "More accounts could not be loaded.",
      );
      window.requestAnimationFrame(() =>
        accountPaginationStatus.current?.focus(),
      );
    } finally {
      setAccountsLoading(false);
    }
  }

  async function loadMoreDeletionRequests() {
    const cursor = deletionPage.nextCursor;
    if (!cursor || deletionsLoading) return;
    setDeletionsLoading(true);
    setDeletionsStale(false);
    setDeletionAnnouncement("Loading more deletion requests…");
    try {
      const response = await apiFetch(adminListPath("deletions", { cursor }));
      const body = (await response.json()) as {
        requests?: OwnerDeletionRequest[];
        page?: unknown;
        error?: AdminListError;
      };
      if (!response.ok) {
        if (body.error?.code === "invalid_admin_cursor") {
          // Never silently drop the continuation: a hidden pending deletion is
          // outstanding owner work, so say so and offer a reload from the start.
          setDeletionsStale(true);
          setDeletionPage((current) => ({
            ...current,
            hasMore: false,
            nextCursor: null,
          }));
          setDeletionAnnouncement(
            "The deletion requests changed. Reload from the first page before continuing.",
          );
          window.requestAnimationFrame(() =>
            deletionPaginationStatus.current?.focus(),
          );
          return;
        }
        throw new Error(
          body.error?.message ?? "More deletion requests could not be loaded.",
        );
      }
      const nextRequests = body.requests ?? [];
      const nextPage = readAdminPage(body.page, nextRequests.length);
      const combined = appendUniqueById(deletionRequests, nextRequests);
      const added = combined.length - deletionRequests.length;
      setDeletionRequests(combined);
      setDeletionPage(nextPage);
      setDeletionAnnouncement(
        `Loaded ${added} more deletion request${added === 1 ? "" : "s"
        }. ${combined.length} total loaded.`,
      );
      window.requestAnimationFrame(() =>
        deletionPaginationStatus.current?.focus(),
      );
    } catch (caught) {
      setDeletionAnnouncement(
        caught instanceof Error
          ? caught.message
          : "More deletion requests could not be loaded.",
      );
      window.requestAnimationFrame(() =>
        deletionPaginationStatus.current?.focus(),
      );
    } finally {
      setDeletionsLoading(false);
    }
  }

  async function loadMoreAuditEvents() {
    const cursor = auditPage.nextCursor;
    if (!cursor || auditLoading) return;
    setAuditLoading(true);
    setAuditStale(false);
    setAuditAnnouncement("Loading more audit events…");
    try {
      const response = await apiFetch(
        adminListPath("audit", {
          cursor,
        }),
      );
      const body = (await response.json()) as {
        events?: AuditEvent[];
        page?: unknown;
        error?: AdminListError;
      };
      if (!response.ok) {
        if (body.error?.code === "invalid_admin_cursor") {
          setAuditStale(true);
          setAuditPage((current) => ({
            ...current,
            hasMore: false,
            nextCursor: null,
          }));
          setAuditAnnouncement(
            "The audit results changed. Reload from the first page before continuing.",
          );
          window.requestAnimationFrame(() =>
            auditPaginationStatus.current?.focus(),
          );
          return;
        }
        throw new Error(
          body.error?.message ?? "More audit events could not be loaded.",
        );
      }
      const nextEvents = body.events ?? [];
      const nextPage = readAdminPage(body.page, nextEvents.length);
      const combinedEvents = appendUniqueById(auditEvents, nextEvents);
      const addedEvents = combinedEvents.length - auditEvents.length;
      setAuditEvents(combinedEvents);
      setAuditPage(nextPage);
      setAuditAnnouncement(
        `Loaded ${addedEvents} more audit event${addedEvents === 1 ? "" : "s"
        }. ${combinedEvents.length} total loaded.`,
      );
      window.requestAnimationFrame(() =>
        auditPaginationStatus.current?.focus(),
      );
    } catch (caught) {
      setAuditAnnouncement(
        caught instanceof Error
          ? caught.message
          : "More audit events could not be loaded.",
      );
      window.requestAnimationFrame(() =>
        auditPaginationStatus.current?.focus(),
      );
    } finally {
      setAuditLoading(false);
    }
  }

  function beginStateChange(target: Project42Account, state: AccountState) {
    setAccountAction({ accountId: target.id, nextState: state });
    setAccountActionReason("");
    setAccountActionConfirmation("");
  }

  function cancelStateChange() {
    setAccountAction(null);
    setAccountActionReason("");
    setAccountActionConfirmation("");
  }

  async function changeState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountAction || !selectedAccount) return;
    const reason = accountActionReason.trim();
    if (
      reason.length < 5 ||
      reason.length > 500 ||
      (accountAction.nextState === "revoked" &&
        accountActionConfirmation !== "REVOKE")
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(
        `/v1/admin/accounts/${encodeURIComponent(selectedAccount.id)}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({ state: accountAction.nextState, reason }),
        },
      );
      const body = (await response.json()) as {
        account?: Project42Account;
        error?: { message?: string };
      };
      if (!response.ok || !body.account) {
        throw new Error(body.error?.message ?? "Account state could not be changed.");
      }
      setAccounts((current) =>
        current.map((candidate) =>
          candidate.id === body.account?.id ? body.account : candidate,
        ),
      );
      setMessage(
        `${accountLabel(selectedAccount)} changed to ${accountAction.nextState}.`,
      );
      cancelStateChange();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Account change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const domain = String(form.get("domain") ?? "");
    const reason = String(form.get("reason") ?? "");
    setBusy(true);
    try {
      const response = await apiFetch("/v1/admin/domains", {
        method: "POST",
        body: JSON.stringify({
          domain,
          reason,
          enabled: automaticDomainApprovalEnabled,
        }),
      });
      const body = (await response.json()) as {
        domain?: DomainRule;
        error?: { message?: string };
      };
      if (!response.ok || !body.domain) {
        throw new Error(body.error?.message ?? "Domain rule could not be created.");
      }
      setDomains((current) =>
        [...current, body.domain as DomainRule].sort((left, right) =>
          left.domain.localeCompare(right.domain),
        ),
      );
      event.currentTarget.reset();
      setMessage(
        body.domain.enabled
          ? `Exact-domain approval enabled for ${body.domain.domain}.`
          : `${body.domain.domain} staged as a disabled rule.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Domain change failed.");
    } finally {
      setBusy(false);
    }
  }

  function beginDomainAction(
    rule: DomainRule,
    kind: DomainRuleAction["kind"],
  ) {
    setDomainAction({ kind, ruleId: rule.id });
    setDomainActionReason("");
  }

  function cancelDomainAction() {
    setDomainAction(null);
    setDomainActionReason("");
  }

  async function submitDomainAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domainAction || !selectedDomain) return;
    const reason = domainActionReason.trim();
    if (reason.length < 5 || reason.length > 500) return;
    const remove = domainAction.kind === "remove";
    setBusy(true);
    try {
      const response = await apiFetch(
        `/v1/admin/domains/${encodeURIComponent(selectedDomain.id)}`,
        {
          method: remove ? "DELETE" : "PATCH",
          body: JSON.stringify(
            remove
              ? { reason }
              : { enabled: domainAction.kind === "enable", reason },
          ),
        },
      );
      const body = (await response.json()) as {
        domain?: DomainRule;
        error?: { message?: string };
      };
      if (!response.ok || !body.domain) {
        throw new Error(
          body.error?.message ??
          (remove
            ? "Domain rule could not be removed."
            : "Domain rule could not be changed."),
        );
      }
      if (remove) {
        setDomains((current) =>
          current.filter((candidate) => candidate.id !== body.domain?.id),
        );
        setMessage(`Removed ${body.domain.domain}.`);
      } else {
        setDomains((current) =>
          current.map((candidate) =>
            candidate.id === body.domain?.id ? body.domain : candidate,
          ),
        );
        setMessage(`Domain rule ${body.domain.enabled ? "enabled" : "disabled"}.`);
      }
      cancelDomainAction();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : remove
            ? "Domain removal failed."
            : "Domain change failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function beginDeletionAction(request: OwnerDeletionRequest) {
    setDeletionActionId(request.id);
    setDeletionActionReason("");
    setDeletionActionConfirmation("");
  }

  function cancelDeletionAction() {
    setDeletionActionId(null);
    setDeletionActionReason("");
    setDeletionActionConfirmation("");
  }

  async function completeDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDeletionRequest) return;
    const reason = deletionActionReason.trim();
    if (
      reason.length < 5 ||
      reason.length > 500 ||
      deletionActionConfirmation !== "DELETE"
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(
        `/v1/admin/deletions/${encodeURIComponent(selectedDeletionRequest.id)}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      const body = (await response.json()) as {
        completion?: { deletionRequestId: string };
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.completion) {
        if (body.error?.code === "recent_authentication_required") {
          throw new Error(
            "Sign out and sign in again before completing account deletion.",
          );
        }
        throw new Error(body.error?.message ?? "Deletion could not be completed.");
      }
      setDeletionRequests((current) =>
        current.filter((candidate) => candidate.id !== selectedDeletionRequest.id),
      );
      setMessage("Account and learner data deletion completed.");
      cancelDeletionAction();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Deletion completion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="owner-console" aria-labelledby="owner-console-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Owner administration</p>
          <h2 id="owner-console-title">
            {view === "logs"
              ? "Privileged audit events"
              : view === "settings"
              ? "Console security settings"
              : "Accounts and exact-domain approval"}
          </h2>
        </div>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void load()}
          type="button"
        >
          Refresh
        </button>
      </div>
      <p className="admin-status" role="status">
        {message}
      </p>

      <div className="admin-grid">
        {(view === "accounts" || view === undefined) && (
          <>
            <section className="profile-card" id="accounts">
              <div className="admin-account-heading">
                <div>
                  <h3>Account approval queue</h3>
                  <p>
                    New registrations appear under Pending. Search by name, verified
                    email, role, state, or account identifier.
                  </p>
                </div>
                <strong aria-live="polite">
                  {filteredAccounts.length} shown · {accounts.length} loaded
                  {accountPage.hasMore ? " · more available" : ""}
                </strong>
              </div>
              <div className="admin-account-filters">
                <div>
                  <label htmlFor="admin-account-search">Search accounts</label>
                  <input
                    id="admin-account-search"
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Name or verified email"
                    type="search"
                    value={accountSearch}
                  />
                </div>
                <div>
                  <label htmlFor="admin-account-state">Account state</label>
                  <select
                    disabled={busy || accountsLoading}
                    id="admin-account-state"
                    onChange={(event) => {
                      setAccountStateFilter(event.target.value as AccountStateFilter);
                      setAccounts([]);
                      setAccountPage(legacyAdminPage(0));
                      setAccountsLoading(true);
                      setAccountsStale(false);
                      setAccountAnnouncement("");
                      cancelStateChange();
                    }}
                    value={accountStateFilter}
                  >
                    {accountStateFilters.map((state) => (
                      <option key={state} value={state}>
                        {state === "all"
                          ? "All accounts"
                          : state.charAt(0).toUpperCase() + state.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-account-list">
                {accountsLoading && accounts.length === 0 ? (
                  <p className="admin-empty-state" role="status">
                    Loading accounts…
                  </p>
                ) : null}
                {!accountsLoading && filteredAccounts.length === 0 ? (
                  <p className="admin-empty-state">
                    {accounts.length === 0
                      ? "No accounts were returned for this state."
                      : "No accounts match this state and search."}
                  </p>
                ) : null}
                {filteredAccounts.map((candidate) => (
                  <article key={candidate.id}>
                    <div>
                      <strong>{accountLabel(candidate)}</strong>
                      <small>{candidate.primaryEmail ?? "No verified email"}</small>
                      <small>
                        {candidate.emailVerified ? "Verified email" : "Email not verified"} ·{" "}
                        {candidate.roles.join(", ")}
                      </small>
                    </div>
                    <span className={`account-state account-state-${candidate.state}`}>
                      {candidate.state}
                    </span>
                    <div className="admin-actions">
                      <button
                        aria-controls={`admin-account-detail-${candidate.id}`}
                        aria-expanded={detailAccountId === candidate.id}
                        className="button button-secondary"
                        onClick={() =>
                          setDetailAccountId((current) =>
                            current === candidate.id ? null : candidate.id,
                          )
                        }
                        type="button"
                      >
                        {detailAccountId === candidate.id
                          ? "Hide request detail"
                          : "View request detail"}
                      </button>
                      {nextStates[candidate.state].map((next) => (
                        <button
                          className="button button-secondary"
                          disabled={busy}
                          key={next}
                          onClick={() => beginStateChange(candidate, next)}
                          type="button"
                        >
                          {accountActionLabel(candidate.state, next)}
                        </button>
                      ))}
                    </div>
                    {detailAccountId === candidate.id ? (
                      <dl
                        className="admin-account-detail"
                        id={`admin-account-detail-${candidate.id}`}
                      >
                        <div>
                          <dt>Verified email</dt>
                          <dd>
                            {candidate.primaryEmail ?? "None recorded"}
                            {candidate.primaryEmail
                              ? candidate.emailVerified
                                ? " · verified by the identity provider"
                                : " · not verified"
                              : ""}
                          </dd>
                        </div>
                        <div>
                          <dt>Current state</dt>
                          <dd>{candidate.state}</dd>
                        </div>
                        <div>
                          <dt>Roles</dt>
                          <dd>{candidate.roles.join(", ") || "None"}</dd>
                        </div>
                        <div>
                          <dt>Requested</dt>
                          <dd>{new Date(candidate.createdAt).toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Last updated</dt>
                          <dd>{new Date(candidate.updatedAt).toLocaleString()}</dd>
                        </div>
                        <div>
                          {/*
                            The internal account identifier is what correlates this
                            request with the privileged audit record below. The
                            provider issuer and subject are deliberately not shown:
                            an owner never needs them to decide, and they are the
                            identity key.
                          */}
                          <dt>Account reference</dt>
                          <dd>{candidate.id}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {accountAction?.accountId === candidate.id &&
                      selectedAccount ? (
                      <form
                        className={`admin-account-action${accountAction.nextState === "revoked"
                          ? " admin-account-action-danger"
                          : ""
                          }`}
                        onSubmit={(event) => void changeState(event)}
                      >
                        <h4 ref={accountActionHeading} tabIndex={-1}>
                          {accountActionLabel(
                            selectedAccount.state,
                            accountAction.nextState,
                          )}{" "}
                          {accountLabel(selectedAccount)}
                        </h4>
                        <p>
                          Change this account from <strong>{selectedAccount.state}</strong>{" "}
                          to <strong>{accountAction.nextState}</strong>. The reason is
                          written to the privileged audit record.
                        </p>
                        {accountAction.nextState === "revoked" ? (
                          <p role="alert">
                            Revocation is permanent for this identity. It cannot be
                            restored from this console.
                          </p>
                        ) : null}
                        <label htmlFor="admin-account-action-reason">Reason</label>
                        <textarea
                          id="admin-account-action-reason"
                          maxLength={500}
                          minLength={5}
                          onChange={(event) =>
                            setAccountActionReason(event.target.value)
                          }
                          required
                          rows={3}
                          value={accountActionReason}
                        />
                        {accountAction.nextState === "revoked" ? (
                          <>
                            <label htmlFor="admin-account-action-confirmation">
                              Enter REVOKE to confirm
                            </label>
                            <input
                              autoComplete="off"
                              id="admin-account-action-confirmation"
                              onChange={(event) =>
                                setAccountActionConfirmation(event.target.value)
                              }
                              required
                              value={accountActionConfirmation}
                            />
                          </>
                        ) : null}
                        <div className="button-row">
                          <button
                            className="button button-primary"
                            disabled={
                              busy ||
                              accountActionReason.trim().length < 5 ||
                              (accountAction.nextState === "revoked" &&
                                accountActionConfirmation !== "REVOKE")
                            }
                            type="submit"
                          >
                            Confirm{" "}
                            {accountActionLabel(
                              selectedAccount.state,
                              accountAction.nextState,
                            ).toLocaleLowerCase()}
                          </button>
                          <button
                            className="button button-secondary"
                            disabled={busy}
                            onClick={cancelStateChange}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="admin-pagination" aria-label="Account result pages">
                {accountAnnouncement ? (
                  <p
                    className="admin-pagination-status"
                    ref={accountPaginationStatus}
                    role={accountsStale ? "alert" : "status"}
                    tabIndex={-1}
                  >
                    {accountAnnouncement}
                  </p>
                ) : accountPage.mode === "legacy" && !accountsLoading ? (
                  <p className="admin-pagination-status" role="status">
                    The current account service returned all matching accounts without
                    continuation metadata.
                  </p>
                ) : !accountPage.hasMore && accounts.length > 0 && !accountsLoading ? (
                  <p className="admin-pagination-status">End of account results.</p>
                ) : null}
                <div className="button-row">
                  {accountPage.hasMore && accountPage.nextCursor ? (
                    <button
                      className="button button-secondary"
                      disabled={busy || accountsLoading}
                      onClick={() => void loadMoreAccounts()}
                      type="button"
                    >
                      {accountsLoading ? "Loading more accounts…" : "Load more accounts"}
                    </button>
                  ) : null}
                  {accountsStale ? (
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => void load()}
                      type="button"
                    >
                      Reload accounts from start
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="profile-card" id="domains">
              <h3>Approved email domains</h3>
              <p>
                Matching is exact and only applies when the identity provider marks the
                primary email verified.
              </p>
              {!automaticDomainApprovalEnabled ? (
                <p role="status">
                  Automatic approval remains locked until the deployment validates real
                  signed verified-email claims. You can safely stage disabled rules now.
                </p>
              ) : null}
              <form className="domain-form" onSubmit={(event) => void createDomain(event)}>
                <label htmlFor="approved-domain">Exact domain</label>
                <input
                  id="approved-domain"
                  name="domain"
                  placeholder="example.com"
                  required
                />
                <label htmlFor="domain-reason">Reason</label>
                <input
                  id="domain-reason"
                  minLength={5}
                  name="reason"
                  required
                />
                <button
                  className="button button-primary"
                  disabled={busy}
                  type="submit"
                >
                  {automaticDomainApprovalEnabled ? "Add enabled rule" : "Stage disabled rule"}
                </button>
              </form>
              <div className="domain-list">
                {domains.map((rule) => (
                  <article key={rule.id}>
                    <div>
                      <strong>{rule.domain}</strong>
                      <small>
                        {rule.enabled ? "Auto-approval enabled" : "Disabled"} · policy v
                        {rule.policyVersion}
                      </small>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="button button-secondary"
                        disabled={
                          busy || (!automaticDomainApprovalEnabled && !rule.enabled)
                        }
                        onClick={() =>
                          beginDomainAction(rule, rule.enabled ? "disable" : "enable")
                        }
                        type="button"
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={busy || rule.enabled}
                        onClick={() => beginDomainAction(rule, "remove")}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    {domainAction?.ruleId === rule.id && selectedDomain ? (
                      <form
                        className={`admin-account-action${domainAction.kind === "remove"
                          ? " admin-account-action-danger"
                          : ""
                          }`}
                        onSubmit={(event) => void submitDomainAction(event)}
                      >
                        <h4 ref={domainActionHeading} tabIndex={-1}>
                          {domainAction.kind === "remove"
                            ? "Remove"
                            : domainAction.kind === "enable"
                              ? "Enable"
                              : "Disable"}{" "}
                          {selectedDomain.domain}
                        </h4>
                        <p>
                          {domainAction.kind === "remove"
                            ? "Remove this disabled exact-domain rule. The rule must be recreated before it can be used again."
                            : `${domainAction.kind === "enable" ? "Enable" : "Disable"} automatic approval for this exact verified-email domain.`}{" "}
                          The reason is written to the privileged audit record.
                        </p>
                        <label htmlFor="admin-domain-action-reason">Reason</label>
                        <textarea
                          id="admin-domain-action-reason"
                          maxLength={500}
                          minLength={5}
                          onChange={(event) =>
                            setDomainActionReason(event.target.value)
                          }
                          required
                          rows={3}
                          value={domainActionReason}
                        />
                        <div className="button-row">
                          <button
                            className="button button-primary"
                            disabled={busy || domainActionReason.trim().length < 5}
                            type="submit"
                          >
                            Confirm {domainAction.kind}
                          </button>
                          <button
                            className="button button-secondary"
                            disabled={busy}
                            onClick={cancelDomainAction}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="profile-card" id="deletions">
              <div className="admin-account-heading">
                <div>
                  <h3>Deletion requests</h3>
                </div>
                <strong aria-live="polite">
                  {deletionRequests.length} loaded
                  {deletionPage.hasMore ? " · more available" : ""}
                </strong>
              </div>
              {deletionsLoading && deletionRequests.length === 0 ? (
                <p role="status">Loading deletion requests…</p>
              ) : null}
              {!deletionsLoading && deletionRequests.length === 0 ? (
                <p>No account deletion requests are waiting.</p>
              ) : (
                <div className="admin-account-list">
                  {deletionRequests.map((request) => {
                    const cancellationOpen =
                      loadedAt < Date.parse(request.cancellationDeadline);
                    return (
                      <article key={request.id}>
                        <div>
                          <strong>
                            {request.displayName ?? request.primaryEmail ?? request.userId}
                          </strong>
                          <small>
                            Requested {new Date(request.requestedAt).toLocaleString()}
                          </small>
                        </div>
                        <span className="account-state">
                          {cancellationOpen ? "cancellation open" : request.state}
                        </span>
                        <div className="admin-actions">
                          <button
                            className="button button-secondary"
                            disabled={busy || cancellationOpen}
                            onClick={() => beginDeletionAction(request)}
                            type="button"
                          >
                            Complete deletion
                          </button>
                        </div>
                        {deletionActionId === request.id &&
                          selectedDeletionRequest ? (
                          <form
                            className="admin-account-action admin-account-action-danger"
                            onSubmit={(event) => void completeDeletion(event)}
                          >
                            <h4 ref={deletionActionHeading} tabIndex={-1}>
                              Permanently delete{" "}
                              {selectedDeletionRequest.displayName ??
                                selectedDeletionRequest.primaryEmail ??
                                selectedDeletionRequest.userId}
                            </h4>
                            <p role="alert">
                              This completes the approved deletion request and removes
                              the account and learner data. The reason is written to the
                              privileged audit record.
                            </p>
                            <label htmlFor="admin-deletion-action-reason">Reason</label>
                            <textarea
                              id="admin-deletion-action-reason"
                              maxLength={500}
                              minLength={5}
                              onChange={(event) =>
                                setDeletionActionReason(event.target.value)
                              }
                              required
                              rows={3}
                              value={deletionActionReason}
                            />
                            <label htmlFor="admin-deletion-action-confirmation">
                              Enter DELETE to confirm
                            </label>
                            <input
                              autoComplete="off"
                              id="admin-deletion-action-confirmation"
                              onChange={(event) =>
                                setDeletionActionConfirmation(event.target.value)
                              }
                              required
                              value={deletionActionConfirmation}
                            />
                            <div className="button-row">
                              <button
                                className="button button-primary"
                                disabled={
                                  busy ||
                                  deletionActionReason.trim().length < 5 ||
                                  deletionActionConfirmation !== "DELETE"
                                }
                                type="submit"
                              >
                                Confirm permanent deletion
                              </button>
                              <button
                                className="button button-secondary"
                                disabled={busy}
                                onClick={cancelDeletionAction}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="admin-pagination" aria-label="Deletion request pages">
                {deletionAnnouncement ? (
                  <p
                    className="admin-pagination-status"
                    ref={deletionPaginationStatus}
                    role={deletionsStale ? "alert" : "status"}
                    tabIndex={-1}
                  >
                    {deletionAnnouncement}
                  </p>
                ) : deletionPage.mode === "legacy" && !deletionsLoading ? (
                  <p className="admin-pagination-status" role="status">
                    The current account service returned all deletion requests
                    without continuation metadata.
                  </p>
                ) : !deletionPage.hasMore &&
                  deletionRequests.length > 0 &&
                  !deletionsLoading ? (
                  <p className="admin-pagination-status">
                    End of deletion requests.
                  </p>
                ) : null}
                <div className="button-row">
                  {deletionPage.hasMore && deletionPage.nextCursor ? (
                    <button
                      className="button button-secondary"
                      disabled={busy || deletionsLoading}
                      onClick={() => void loadMoreDeletionRequests()}
                      type="button"
                    >
                      {deletionsLoading
                        ? "Loading more deletion requests…"
                        : "Load more deletion requests"}
                    </button>
                  ) : null}
                  {deletionsStale ? (
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => void load()}
                      type="button"
                    >
                      Reload deletion requests from start
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </>
        )}

        {(view === "logs" || view === undefined) && (
          <section className="profile-card" id="audit">
            <div className="admin-account-heading">
              <div>
                <h3>Privileged audit events</h3>
                <p>
                  The newest request-correlated administrative and data-rights events
                  are shown first.
                </p>
              </div>
              <strong aria-live="polite">
                {auditEvents.length} loaded
                {auditPage.hasMore ? " · more available" : ""}
              </strong>
            </div>
            {auditLoading && auditEvents.length === 0 ? (
              <p role="status">Loading privileged audit events…</p>
            ) : null}
            {!auditLoading && auditEvents.length === 0 ? (
              <p>No privileged audit events are recorded.</p>
            ) : (
              <div className="audit-event-list">
                {auditEvents.map((event) => (
                  <article key={event.id}>
                    <div>
                      <strong>{event.action}</strong>
                      <small>{new Date(event.occurredAt).toLocaleString()}</small>
                    </div>
                    <span className="account-state">{event.outcome}</span>
                    <p>{event.reason}</p>
                    <small>Request {event.requestId}</small>
                  </article>
                ))}
              </div>
            )}
            <div className="admin-pagination" aria-label="Audit result pages">
              {auditAnnouncement ? (
                <p
                  className="admin-pagination-status"
                  ref={auditPaginationStatus}
                  role={auditStale ? "alert" : "status"}
                  tabIndex={-1}
                >
                  {auditAnnouncement}
                </p>
              ) : auditPage.mode === "legacy" && !auditLoading ? (
                <p className="admin-pagination-status" role="status">
                  The current account service returned all audit events without
                  continuation metadata.
                </p>
              ) : !auditPage.hasMore && auditEvents.length > 0 && !auditLoading ? (
                <p className="admin-pagination-status">End of audit results.</p>
              ) : null}
              <div className="button-row">
                {auditPage.hasMore && auditPage.nextCursor ? (
                  <button
                    className="button button-secondary"
                    disabled={busy || auditLoading}
                    onClick={() => void loadMoreAuditEvents()}
                    type="button"
                  >
                    {auditLoading
                      ? "Loading more audit events…"
                      : "Load more audit events"}
                  </button>
                ) : null}
                {auditStale ? (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => void load()}
                    type="button"
                  >
                    Reload audit from start
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="profile-card" id="settings">
            <div className="admin-account-heading">
              <div>
                <h3>Console security policy</h3>
                <p>
                  The operational console uses a fixed high-contrast theme. Learner
                  theme and layout preferences are managed only by the public portal
                  and never alter this administrative surface.
                </p>
              </div>
            </div>
            <div>
              <h4 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>
                Registration and tenant policy
              </h4>
              <p className="account-muted-copy">
                Identity, registration, and session policy are enforced by the
                account API and deployment configuration. This page intentionally
                exposes no client-side controls that could imply a security change.
              </p>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
