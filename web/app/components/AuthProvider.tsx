"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  forgetRegistrationRequest,
  parseRegistrationStatus,
  readBrowserAuthOutcome,
  registrationPhaseForInvalidReceipt,
  registrationRetryDelaySeconds,
  registrationWasRequestedHere,
  rememberRegistrationRequest,
  type BrowserAuthOutcome,
  type RegistrationStatusReceipt,
} from "../lib/registrationStatus";
import config from "../../project42.config.json";
import { canonicalOrigin, orgName } from "../../lib/copy";

const configuredApiOrigin = (config as { portal: { apiOrigin?: string } }).portal.apiOrigin;

export type AccountState =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "revoked";
export type AccountRole = "learner" | "owner";

export interface Project42Account {
  id: string;
  installationId: string;
  identity: { issuer: string; subject: string };
  displayName: string | null;
  primaryEmail: string | null;
  emailVerified: boolean;
  state: AccountState;
  roles: AccountRole[];
  createdAt: string;
  updatedAt: string;
}

type AuthStatus =
  | "unavailable"
  | "loading"
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "error";

export type RegistrationPhase =
  | "none"
  | "checking"
  | "current"
  | "expired"
  | "provider-error"
  | "account-unavailable"
  | "temporarily-unavailable";

export interface RegistrationExperience {
  phase: RegistrationPhase;
  receipt: RegistrationStatusReceipt | null;
  retryAt: string | null;
}

interface AuthContextValue {
  configured: boolean;
  status: AuthStatus;
  account: Project42Account | null;
  registration: RegistrationExperience;
  error: string | null;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  completeSignIn: () => Promise<void>;
  completeGithubLink: () => Promise<string>;
  refreshRegistration: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  signIn: (returnPath?: string) => Promise<void>;
  startGithubLink: (returnPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface StoredGithubLinkFlow {
  transactionId: string;
  state: string;
  verifier: string;
  returnPath: string;
  expiresAt: string;
}

// The retired cross-subdomain auth cookie was set on the registrable domain
// of the portal origin. Deriving it keeps the cleanup correct for any
// deployment instead of only for project-42.dev.
const retiredCookieDomain = (() => {
  try {
    const host = new URL(canonicalOrigin).hostname;
    const labels = host.split(".");
    return labels.length > 2 ? `.${labels.slice(-2).join(".")}` : `.${host}`;
  } catch {
    return "";
  }
})();

interface BrowserSession {
  expiresAt: string;
  absoluteExpiresAt: string;
}

// The account API origin is deployment configuration, not product code. It
// used to default to this deployment's own api.project-42.dev, so an adopter
// who forgot the environment variable silently pointed their learners at
// somebody else's account service. portal.apiOrigin in
// project42.config.json is the declared value; the environment variable still
// overrides it for local development against a different API.
const apiOrigin = readApiOrigin(
  process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN ?? configuredApiOrigin ?? "",
);
const configured = Boolean(apiOrigin);
const githubLinkFlowKey = "project42.identity-link.github.v1";
const emptyRegistration: RegistrationExperience = {
  phase: "none",
  receipt: null,
  retryAt: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function accountServiceErrorMessage(caught: unknown): string {
  if (caught instanceof TypeError) {
    return (
      `The ${orgName} account service could not be reached. Your sign-in was not ` +
      "cleared. Check your connection, then try again."
    );
  }
  return caught instanceof Error ? caught.message : "Sign-in failed.";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomValue(size = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

function safeReturnPath(
  returnPath: string,
  fallback = "/account",
): string {
  if (
    !returnPath.startsWith("/") ||
    returnPath.startsWith("//") ||
    returnPath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(returnPath)
  ) {
    return fallback;
  }
  const target = new URL(returnPath, window.location.origin);
  if (
    target.origin !== window.location.origin ||
    target.username ||
    target.password ||
    target.hash
  ) {
    return fallback;
  }
  return `${target.pathname}${target.search}`;
}

function readApiOrigin(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const target = new URL(normalized);
  const loopback =
    target.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    (target.protocol !== "https:" && !loopback) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_PROJECT42_API_ORIGIN must be an HTTPS origin or an HTTP loopback origin.",
    );
  }
  return target.origin;
}

function hasSingleSearchParam(
  target: URL,
  name: string,
  expected?: string,
): boolean {
  const values = target.searchParams.getAll(name);
  return (
    values.length === 1 &&
    (expected === undefined ? values[0].length > 0 : values[0] === expected)
  );
}

function readGithubLinkFlow(): StoredGithubLinkFlow | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(githubLinkFlowKey) ?? "null",
    ) as StoredGithubLinkFlow | null;
    if (
      !parsed ||
      typeof parsed.transactionId !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.returnPath !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      sessionStorage.removeItem(githubLinkFlowKey);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(githubLinkFlowKey);
    return null;
  }
}

function clearRetiredAuthCache() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("project42.auth-cache.v1");
    document.cookie = "project42.auth.v1=; max-age=0; path=/; SameSite=Lax; Secure";
    if (retiredCookieDomain) {
      document.cookie = `project42.auth.v1=; max-age=0; domain=${retiredCookieDomain}; path=/; SameSite=Lax; Secure`;
    }
  } catch {
    // Best-effort cleanup of the retired cross-subdomain cache.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "unavailable",
  );
  const [account, setAccount] = useState<Project42Account | null>(null);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [registration, setRegistration] =
    useState<RegistrationExperience>(emptyRegistration);
  const [error, setError] = useState<string | null>(null);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!apiOrigin) throw new Error(`${orgName} API is not configured.`);
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${apiOrigin}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "include",
    });
  }, []);

  const loadRegistration = useCallback(
    async (outcome: BrowserAuthOutcome, expectedReceipt: boolean) => {
      setRegistration((current) => ({
        phase: "checking",
        receipt: current.receipt,
        retryAt: null,
      }));
      try {
        const response = await apiFetch("/v1/registration/status");
        if (response.ok) {
          const receipt = parseRegistrationStatus(await response.json());
          // A valid receipt is the proof that this browser has an open
          // request, and it is recorded HERE rather than only at the request
          // button because the button is not the only way to make one: "Sign
          // in" and "Request an account" start the identical OIDC flow, so a
          // stranger who pressed "Sign in" is just as pending and would
          // otherwise be the one left with no memory of it when the owner's
          // decision revokes the receipt.
          rememberRegistrationRequest();
          setRegistration({
            phase: "current",
            receipt,
            retryAt: new Date(Date.now() + 10_000).toISOString(),
          });
          setError(null);
          setStatus("signed-out");
          return;
        }
        if (response.status === 401) {
          const phase: RegistrationPhase = registrationPhaseForInvalidReceipt(
            outcome,
            expectedReceipt || registrationWasRequestedHere(),
          );
          setRegistration({ phase, receipt: null, retryAt: null });
          setError(null);
          setStatus("signed-out");
          return;
        }
        const retrySeconds = registrationRetryDelaySeconds(
          response.headers.get("retry-after"),
        );
        setRegistration({
          phase: "temporarily-unavailable",
          receipt: null,
          retryAt: new Date(Date.now() + retrySeconds * 1_000).toISOString(),
        });
        setError(null);
        setStatus("signed-out");
      } catch {
        setRegistration({
          phase: "temporarily-unavailable",
          receipt: null,
          retryAt: new Date(Date.now() + 30_000).toISOString(),
        });
        setError(null);
        setStatus("signed-out");
      }
    },
    [apiFetch],
  );

  const loadAccount = useCallback(async (outcome: BrowserAuthOutcome = null) => {
    if (!configured) return;
    try {
      const response = await apiFetch("/v1/auth/session");
      const body = (await response.json()) as {
        account?: Project42Account;
        session?: BrowserSession;
        error?: { message?: string };
      };
      if (response.status === 401) {
        clearRetiredAuthCache();
        setAccount(null);
        setSession(null);
        await loadRegistration(
          outcome,
          outcome === "pending" ||
          outcome === "rejected" ||
          outcome === "success",
        );
        return;
      }
      if (!response.ok || !body.account) {
        throw new Error(body.error?.message ?? "The account could not be loaded.");
      }
      clearRetiredAuthCache();
      setAccount(body.account);
      setSession(body.session ?? null);
      setRegistration(emptyRegistration);
      // The request is spent. Leaving the marker would tell this learner, on
      // some later visit after signing out, that they have a request waiting.
      forgetRegistrationRequest();
      setError(null);
      setStatus("signed-in");
    } catch (caught) {
      clearRetiredAuthCache();
      setAccount(null);
      setSession(null);
      setRegistration(emptyRegistration);
      setError(accountServiceErrorMessage(caught));
      setStatus("error");
    }
  }, [apiFetch, loadRegistration]);

  const refreshAccount = useCallback(async () => {
    await loadAccount();
  }, [loadAccount]);

  const refreshRegistration = useCallback(async () => {
    await loadRegistration(null, true);
  }, [loadRegistration]);

  useEffect(() => {
    if (!configured) return;
    const outcome = readBrowserAuthOutcome(window.location.search);
    if (new URLSearchParams(window.location.search).has("auth")) {
      const target = new URL(window.location.href);
      target.searchParams.delete("auth");
      window.history.replaceState(
        {},
        "",
        `${target.pathname}${target.search}${target.hash}`,
      );
    }
    const timer = window.setTimeout(() => void loadAccount(outcome), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  const signIn = useCallback(async (returnPath = "/account") => {
    if (!apiOrigin) return;
    setStatus("signing-in");
    setError(null);
    const returnTo = new URL(
      safeReturnPath(returnPath),
      window.location.origin,
    );
    const target = new URL("/v1/auth/start", `${apiOrigin}/`);
    target.searchParams.set("return_to", returnTo.toString());
    // Replace the current document so authentication stays in the current tab.
    // This also prevents the pre-auth page from remaining behind as a second
    // apparent sign-in window.
    window.location.replace(target.toString());
  }, []);

  const recordStoredTermsAcceptance = useCallback(async (
    path = "/v1/me/terms-acceptance",
  ) => {
    const termsStorageKey = "project42.terms-acceptance.v1";
    try {
      const raw = sessionStorage.getItem(termsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        termsVersion: string;
        acceptedAt: string;
      };
      if (!parsed.termsVersion || !parsed.acceptedAt) return;
      const response = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      if (!response.ok) return;
      sessionStorage.removeItem(termsStorageKey);
    } catch {
      // Terms acceptance recording is best-effort after sign-in.
      // The stored acceptance remains in sessionStorage for a retry
      // on the next sign-in if this one fails.
    }
  }, [apiFetch]);

  useEffect(() => {
    if (status === "signed-in") {
      void recordStoredTermsAcceptance();
      return;
    }
    if (registration.phase === "current") {
      void recordStoredTermsAcceptance(
        "/v1/registration/terms-acceptance",
      );
    }
  }, [recordStoredTermsAcceptance, registration.phase, status]);

  const completeSignIn = useCallback(async () => {
    const query = new URLSearchParams(window.location.search);
    window.history.replaceState({}, "", "/account");
    if (query.get("auth") === "success") {
      await refreshAccount();
      await recordStoredTermsAcceptance();
      return;
    }
    if (query.get("auth") === "pending" || query.get("auth") === "rejected") {
      await refreshRegistration();
      return;
    }
    if (query.get("auth") === "error") {
      throw new Error("The identity provider did not complete sign-in. Start again.");
    }
    throw new Error(
      "This callback belongs to the retired browser-token flow. Start sign-in again.",
    );
  }, [recordStoredTermsAcceptance, refreshAccount, refreshRegistration]);

  const renewSession = useCallback(async () => {
    const response = await apiFetch("/v1/auth/renew", { method: "POST" });
    const body = (await response.json()) as {
      session?: BrowserSession;
      error?: { message?: string };
    };
    if (response.status === 401) {
      setAccount(null);
      setSession(null);
      setError(null);
      setStatus("signed-out");
      return;
    }
    if (response.status === 409) {
      await refreshAccount();
      return;
    }
    if (!response.ok || !body.session) {
      throw new Error(
        body.error?.message ?? "The secure session could not be renewed.",
      );
    }
    setSession(body.session);
  }, [apiFetch, refreshAccount]);

  useEffect(() => {
    if (status !== "signed-in" || account?.state !== "approved" || !session) {
      return;
    }
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const renewIn = Math.min(
      2_147_000_000,
      Math.max(1_000, expiresAt - Date.now() - 5 * 60_000),
    );
    const timer = window.setTimeout(() => {
      void renewSession().catch((caught) => {
        setError(accountServiceErrorMessage(caught));
        setStatus("error");
      });
    }, renewIn);
    return () => window.clearTimeout(timer);
  }, [account?.state, renewSession, session, status]);

  const startGithubLink = useCallback(
    async (returnPath = "/account?linked=github") => {
      const safeReturnPathValue = safeReturnPath(
        returnPath,
        "/account?linked=github",
      );
      const verifier = randomValue(48);
      const codeChallenge = await pkceChallenge(verifier);
      const redirectUri = new URL(
        "/account/github/callback/",
        window.location.origin,
      ).toString();
      const response = await apiFetch("/v1/me/identity-links/github", {
        method: "POST",
        body: JSON.stringify({
          codeChallenge,
          codeChallengeMethod: "S256",
          returnPath: safeReturnPathValue,
        }),
      });
      const body = (await response.json()) as {
        link?: {
          id: string;
          state: string;
          returnPath: string;
          expiresAt: string;
        };
        authorizationUrl?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.link || !body.authorizationUrl) {
        throw new Error(
          body.error?.message ?? "GitHub account linking could not be started.",
        );
      }
      const target = new URL(body.authorizationUrl);
      const expectedParameterCount = 5;
      if (
        target.origin !== "https://github.com" ||
        target.pathname !== "/login/oauth/authorize" ||
        target.username ||
        target.password ||
        target.hash ||
        [...target.searchParams].length !== expectedParameterCount ||
        !hasSingleSearchParam(target, "state", body.link.state) ||
        !hasSingleSearchParam(target, "client_id") ||
        !hasSingleSearchParam(target, "redirect_uri", redirectUri) ||
        !hasSingleSearchParam(target, "code_challenge", codeChallenge) ||
        !hasSingleSearchParam(target, "code_challenge_method", "S256") ||
        body.link.returnPath !== safeReturnPathValue
      ) {
        throw new Error("The GitHub authorization destination was not valid.");
      }
      sessionStorage.setItem(
        githubLinkFlowKey,
        JSON.stringify({
          transactionId: body.link.id,
          state: body.link.state,
          verifier,
          returnPath: body.link.returnPath,
          expiresAt: body.link.expiresAt,
        } satisfies StoredGithubLinkFlow),
      );
      window.location.assign(target.toString());
    },
    [apiFetch],
  );

  const completeGithubLink = useCallback(async () => {
    const query = new URLSearchParams(window.location.search);
    window.history.replaceState({}, "", "/account/github/callback/");
    const flow = readGithubLinkFlow();
    const providerError = query.get("error");
    if (providerError) {
      if (flow) {
        await apiFetch(
          `/v1/me/identity-links/${encodeURIComponent(flow.transactionId)}`,
          { method: "DELETE" },
        ).catch(() => undefined);
      }
      sessionStorage.removeItem(githubLinkFlowKey);
      throw new Error(
        query.get("error_description") ??
        "GitHub authorization was cancelled or rejected.",
      );
    }
    const code = query.get("code");
    const returnedState = query.get("state");
    const expiresAt = flow ? Date.parse(flow.expiresAt) : Number.NaN;
    if (
      !flow ||
      !code ||
      !returnedState ||
      flow.state !== returnedState ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      sessionStorage.removeItem(githubLinkFlowKey);
      throw new Error("The GitHub identity-link response was incomplete or expired.");
    }
    const response = await apiFetch("/v1/me/identity-links/github/complete", {
      method: "POST",
      body: JSON.stringify({
        transactionId: flow.transactionId,
        state: returnedState,
        code,
        codeVerifier: flow.verifier,
      }),
    });
    const body = (await response.json()) as {
      linkedIdentity?: { provider: string };
      returnPath?: string;
      error?: { message?: string };
    };
    sessionStorage.removeItem(githubLinkFlowKey);
    if (
      !response.ok ||
      body.linkedIdentity?.provider !== "github" ||
      !body.returnPath
    ) {
      throw new Error(
        body.error?.message ?? "GitHub account linking could not be completed.",
      );
    }
    return safeReturnPath(body.returnPath, "/account?linked=github");
  }, [apiFetch]);

  const signOut = useCallback(async () => {
    try {
      const returnTo = new URL("/account", window.location.origin);
      const response = await apiFetch(
        `/v1/auth/signout?return_to=${encodeURIComponent(returnTo.toString())}`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        signedOut?: boolean;
        logoutUrl?: string;
        error?: { message?: string };
      };
      if (response.status !== 401 && (!response.ok || !body.signedOut)) {
        throw new Error(body.error?.message ?? "Sign-out could not be completed.");
      }
      clearRetiredAuthCache();
      sessionStorage.removeItem(githubLinkFlowKey);
      setAccount(null);
      setSession(null);
      setRegistration(emptyRegistration);
      setError(null);
      setStatus(configured ? "signed-out" : "unavailable");
    } catch (caught) {
      setError(accountServiceErrorMessage(caught));
      setStatus("error");
    }
  }, [apiFetch]);

  const value = useMemo(
    () => ({
      configured,
      status,
      account,
      registration,
      error,
      apiFetch,
      completeGithubLink,
      completeSignIn,
      refreshRegistration,
      refreshAccount,
      signIn,
      signOut,
      startGithubLink,
    }),
    [
      status,
      account,
      registration,
      error,
      apiFetch,
      completeGithubLink,
      completeSignIn,
      refreshRegistration,
      refreshAccount,
      signIn,
      signOut,
      startGithubLink,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
