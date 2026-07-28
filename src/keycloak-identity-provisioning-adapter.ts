import type {
  IdentityProviderCompatibility,
  IdentityProvisioningAdapter,
  IdentityProvisioningAdapterContext,
  IdentityProvisioningAdapterResult,
  IdentityProvisioningObservation,
  IdentityProvisioningOperation,
  IdentityProvisioningPlan,
  IdentityProvisioningRecord,
  IdentityProvisioningRollback,
  IdentityProvisioningSecretReference,
} from "./identity-provisioning.js";

const KEYCLOAK_ADMIN_REST_SOURCE =
  "https://www.keycloak.org/docs-api/latest/rest-api/index.html";
const KEYCLOAK_REGISTRATION_SOURCE =
  "https://www.keycloak.org/securing-apps/client-registration";

export interface KeycloakIdentityProvisioningAdapterOptions {
  baseUrl: string;
  realm: string;
  authorityReferenceDigest: string;
  accessToken: () => Promise<string>;
  fetch?: typeof fetch;
}

interface KeycloakClientRepresentation {
  id?: string;
  clientId?: string;
  enabled?: boolean;
  protocol?: string;
  publicClient?: boolean;
  clientAuthenticatorType?: string;
  standardFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  implicitFlowEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  authorizationServicesEnabled?: boolean;
  fullScopeAllowed?: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  defaultClientScopes?: string[];
  attributes?: Record<string, string>;
}

interface KeycloakCredentialRepresentation {
  type?: string;
  value?: string;
}

export class KeycloakIdentityProvisioningAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KeycloakIdentityProvisioningAdapterError";
    this.code = code;
  }
}

export class KeycloakIdentityProvisioningAdapter
  implements IdentityProvisioningAdapter {
  readonly compatibility: IdentityProviderCompatibility;
  readonly #baseUrl: string;
  readonly #realm: string;
  readonly #authorityReferenceDigest: string;
  readonly #accessToken: () => Promise<string>;
  readonly #fetch: typeof fetch;

  constructor(options: KeycloakIdentityProvisioningAdapterOptions) {
    this.#baseUrl = validateBaseUrl(options.baseUrl);
    this.#realm = validateRealm(options.realm);
    if (!/^[a-f0-9]{64}$/.test(options.authorityReferenceDigest)) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "invalid-authority-reference",
        "The Keycloak authority reference must be a SHA-256 digest.",
      );
    }
    this.#authorityReferenceDigest = options.authorityReferenceDigest;
    this.#accessToken = options.accessToken;
    this.#fetch = options.fetch ?? fetch;
    this.compatibility = keycloakIdentityProviderCompatibility();
  }

  async execute(
    operation: IdentityProvisioningOperation,
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    this.#assertPlan(plan);
    switch (operation) {
      case "create":
        return this.#create(plan, previous, context);
      case "validate":
      case "observe":
        return this.#observe(plan, previous, context);
      case "reconcile":
      case "recover":
        return this.#reconcile(plan, previous, context);
      case "rotate":
        return this.#rotate(plan, previous, context);
      case "disable":
        return this.#disable(plan, previous, context);
      case "retire":
        return this.#retire(plan, previous, context);
    }
  }

  async #create(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    const before = await this.#findClient(plan.client.clientRef);
    let client = before;
    if (!client) {
      await this.#request(
        this.#clientsPath(),
        {
          method: "POST",
          body: JSON.stringify(desiredClient(plan, true)),
        },
        [201, 204],
      );
      client = await this.#requireClient(plan.client.clientRef);
    } else {
      if (!previous) {
        throw new KeycloakIdentityProvisioningAdapterError(
          "provider-client-already-exists",
          "Refusing to adopt an untracked Keycloak client.",
        );
      }
      await this.#updateClient(client, plan, true);
      client = await this.#requireClient(plan.client.clientRef);
    }

    const secret = plan.secretPolicy.required
      ? await this.#generateSecret(plan, client, context)
      : null;
    const observation = await this.#observeClient(
      plan,
      client,
      secret,
      context.now,
    );
    if (before && secret && isVerified(observation)) {
      await this.#request(
        `${this.#clientPath(client)}/client-secret/rotated`,
        { method: "DELETE" },
        [200, 204],
      );
    }
    return {
      nextState: "validating",
      continuation: null,
      secret,
      observation,
      rollback: {
        allowed: true,
        restoreState: before ? "ready" : "retired",
        reasonCode: before
          ? "restore-pre-registration-client"
          : "delete-created-client",
        snapshotDigest: await sha256(
          JSON.stringify(before ?? { client: "absent" }),
        ),
      },
      error: null,
      detailCode: before
        ? "existing-client-reconciled"
        : "client-created",
    };
  }

  async #observe(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    const client = await this.#requireClient(plan.client.clientRef);
    const observation = await this.#observeClient(
      plan,
      client,
      previous?.secret ?? null,
      context.now,
    );
    return {
      nextState: "validating",
      continuation: null,
      secret: previous?.secret ?? null,
      observation,
      rollback: noRollback("read-only-observation"),
      error: null,
      detailCode: "client-observed",
    };
  }

  async #reconcile(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    let client = await this.#requireClient(plan.client.clientRef);
    const snapshotDigest = await sha256(JSON.stringify(client));
    await this.#updateClient(client, plan, true);
    client = await this.#requireClient(plan.client.clientRef);

    let secret = previous?.secret ?? null;
    if (plan.secretPolicy.required && !secret) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "secret-reference-missing",
        "A tracked secret reference is required before reconciliation.",
      );
    }
    const observation = await this.#observeClient(
      plan,
      client,
      secret,
      context.now,
    );
    return {
      nextState: "validating",
      continuation: null,
      secret,
      observation,
      rollback: {
        allowed: true,
        restoreState: "ready",
        reasonCode: "restore-prior-client-configuration",
        snapshotDigest,
      },
      error: null,
      detailCode: "client-reconciled",
    };
  }

  async #rotate(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    const client = await this.#requireClient(plan.client.clientRef);
    if (!plan.secretPolicy.required) {
      const observation = await this.#observeClient(
        plan,
        client,
        null,
        context.now,
      );
      return {
        nextState: "validating",
        continuation: null,
        secret: null,
        observation,
        rollback: noRollback("public-client-has-no-secret"),
        error: null,
        detailCode: "public-client-rotation-not-required",
      };
    }
    if (!previous?.secret || previous.secret.status !== "active") {
      throw new KeycloakIdentityProvisioningAdapterError(
        "secret-reference-missing",
        "A tracked active secret is required before rotation.",
      );
    }

    const secret = await this.#generateSecret(plan, client, context);
    const observation = await this.#observeClient(
      plan,
      client,
      secret,
      context.now,
    );
    if (!isVerified(observation)) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "rotated-secret-not-verified",
        "The rotated Keycloak credential did not pass verification.",
      );
    }

    if (previous?.secret) {
      await this.#request(
        `${this.#clientPath(client)}/client-secret/rotated`,
        { method: "DELETE" },
        [200, 204],
      );
      await context.secretSink.revoke(previous.secret);
    }

    return {
      nextState: "validating",
      continuation: null,
      secret,
      observation,
      rollback: {
        allowed: true,
        restoreState: "ready",
        reasonCode: "overlapping-secret-rotation",
        snapshotDigest: previous?.secret?.valueDigest ?? null,
      },
      error: null,
      detailCode: "client-secret-rotated",
    };
  }

  async #disable(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    let client = await this.#requireClient(plan.client.clientRef);
    const snapshotDigest = await sha256(JSON.stringify(client));
    await this.#updateClient(client, plan, false);
    client = await this.#requireClient(plan.client.clientRef);
    const observation = await this.#observeClient(
      plan,
      client,
      previous?.secret ?? null,
      context.now,
    );
    return {
      nextState: "disabled",
      continuation: null,
      secret: previous?.secret ?? null,
      observation,
      rollback: {
        allowed: true,
        restoreState: "ready",
        reasonCode: "reenable-client",
        snapshotDigest,
      },
      error: null,
      detailCode: "client-disabled",
    };
  }

  async #retire(
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult> {
    const client = await this.#findClient(plan.client.clientRef);
    if (client) {
      await this.#request(
        this.#clientPath(client),
        { method: "DELETE" },
        [204],
      );
    }
    let secret = previous?.secret ?? null;
    if (secret && secret.status !== "revoked") {
      await context.secretSink.revoke(secret);
      secret = { ...secret, status: "revoked" };
    }
    return {
      nextState: "retired",
      continuation: null,
      secret,
      observation: null,
      rollback: noRollback("provider-client-retired"),
      error: null,
      detailCode: client
        ? "client-retired"
        : "client-already-absent",
    };
  }

  #assertPlan(plan: IdentityProvisioningPlan): void {
    if (
      plan.provider.id !== this.compatibility.provider ||
      plan.provider.adapterVersion !== this.compatibility.adapterVersion ||
      plan.provider.mode !== "api"
    ) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "incompatible-plan",
        "The plan does not target this Keycloak API adapter.",
      );
    }
    const expectedIssuer =
      `${this.#baseUrl}/realms/${encodeURIComponent(this.#realm)}`;
    if (plan.provider.issuer !== expectedIssuer) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "issuer-boundary-mismatch",
        "The plan issuer does not belong to this Keycloak realm.",
      );
    }
    if (
      plan.provider.authorityBoundary.referenceDigest !==
      this.#authorityReferenceDigest
    ) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "authority-boundary-mismatch",
        "The plan does not belong to this Keycloak authority boundary.",
      );
    }
    if (plan.client.permissions.length !== 0) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "unsupported-client-permissions",
        "The reference adapter does not grant Keycloak management permissions.",
      );
    }
    if (
      plan.secretPolicy.required !==
      (plan.client.tokenEndpointAuthMethod !== "none")
    ) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "secret-policy-mismatch",
        "Keycloak public and confidential client settings disagree.",
      );
    }
  }

  async #findClient(
    clientRef: string,
  ): Promise<KeycloakClientRepresentation | null> {
    const query = new URLSearchParams({
      clientId: clientRef,
      exact: "true",
    });
    const response = await this.#request(
      `${this.#clientsPath()}?${query}`,
      { method: "GET" },
      [200],
    );
    const clients = await safeJson<KeycloakClientRepresentation[]>(
      response,
      "client-list-invalid",
    );
    if (!Array.isArray(clients) || clients.length > 1) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "client-lookup-ambiguous",
        "Keycloak returned an invalid or ambiguous client lookup.",
      );
    }
    const client = clients[0];
    if (!client) return null;
    return validateClient(client, clientRef);
  }

  async #requireClient(
    clientRef: string,
  ): Promise<KeycloakClientRepresentation> {
    const client = await this.#findClient(clientRef);
    if (!client) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "client-not-found",
        "The Keycloak client does not exist.",
      );
    }
    return client;
  }

  async #updateClient(
    client: KeycloakClientRepresentation,
    plan: IdentityProvisioningPlan,
    enabled: boolean,
  ): Promise<void> {
    await this.#request(
      this.#clientPath(client),
      {
        method: "PUT",
        body: JSON.stringify({
          ...client,
          ...desiredClient(plan, enabled),
          id: client.id,
        }),
      },
      [204],
    );
  }

  async #generateSecret(
    plan: IdentityProvisioningPlan,
    client: KeycloakClientRepresentation,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningSecretReference> {
    const response = await this.#request(
      `${this.#clientPath(client)}/client-secret`,
      { method: "POST" },
      [200],
    );
    let credential = await safeJson<KeycloakCredentialRepresentation>(
      response,
      "client-secret-response-invalid",
    );
    if (
      credential.type !== "secret" ||
      typeof credential.value !== "string" ||
      credential.value.length < 16
    ) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "client-secret-response-invalid",
        "Keycloak did not return a usable client credential.",
      );
    }
    const bytes = new TextEncoder().encode(credential.value);
    credential = {};
    const reference = await context.secretSink.store({
      operationId: context.idempotencyKey,
      clientRef: plan.client.clientRef,
      secretManagerRef: plan.secretPolicy.secretManagerRef,
      material: {
        kind: "client-secret",
        value: bytes,
        expiresAt: null,
      },
    });
    bytes.fill(0);
    if (
      reference.status !== "active" ||
      reference.secretManagerRef !== plan.secretPolicy.secretManagerRef
    ) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "secret-sink-result-invalid",
        "The secret manager did not return an active reference.",
      );
    }
    return reference;
  }

  async #observeClient(
    plan: IdentityProvisioningPlan,
    client: KeycloakClientRepresentation,
    secret: IdentityProvisioningSecretReference | null,
    observedAt: string,
  ): Promise<IdentityProvisioningObservation> {
    const desired = desiredClient(plan, true);
    const callbacksVerified =
      equalSet(client.redirectUris, desired.redirectUris) &&
      equalSet(client.webOrigins, desired.webOrigins) &&
      equalSet(
        readPostLogoutUris(client),
        readPostLogoutUris(desired),
      );
    const permissionsVerified =
      plan.client.permissions.length === 0 &&
      client.fullScopeAllowed === false &&
      client.serviceAccountsEnabled === false &&
      client.authorizationServicesEnabled !== true;
    const issuerVerified = await this.#verifyIssuer(plan.provider.issuer);
    const credentialVerified = await this.#verifyCredential(
      plan,
      client,
      secret,
    );
    const clientEnabled = client.enabled === true;
    const ownershipVerified =
      plan.provider.authorityBoundary.referenceDigest ===
      this.#authorityReferenceDigest;
    const desiredStateVerified =
      client.clientId === desired.clientId &&
      client.protocol === desired.protocol &&
      client.publicClient === desired.publicClient &&
      client.clientAuthenticatorType ===
        desired.clientAuthenticatorType &&
      client.standardFlowEnabled === true &&
      client.directAccessGrantsEnabled === false &&
      client.implicitFlowEnabled === false &&
      callbacksVerified &&
      permissionsVerified &&
      clientEnabled;
    return {
      observedAt,
      providerClientRefDigest: await sha256(
        `keycloak:${this.#realm}:${client.id}`,
      ),
      observedStateDigest: desiredStateVerified
        ? plan.desiredStateDigest
        : await sha256(JSON.stringify(normalizeObservedClient(client))),
      ownershipVerified,
      issuerVerified,
      callbacksVerified,
      permissionsVerified,
      credentialVerified,
      clientEnabled,
    };
  }

  async #verifyIssuer(expectedIssuer: string): Promise<boolean> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${expectedIssuer}/.well-known/openid-configuration`,
        { headers: { Accept: "application/json" } },
      );
    } catch {
      throw new KeycloakIdentityProvisioningAdapterError(
        "issuer-discovery-failed",
        "Keycloak OIDC discovery could not be completed.",
      );
    }
    if (response.status !== 200) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "issuer-discovery-unexpected",
        `Keycloak OIDC discovery returned status ${response.status}.`,
      );
    }
    const discovery = await safeJson<{ issuer?: string }>(
      response,
      "issuer-discovery-invalid",
    );
    return discovery.issuer === expectedIssuer;
  }

  async #verifyCredential(
    plan: IdentityProvisioningPlan,
    client: KeycloakClientRepresentation,
    secret: IdentityProvisioningSecretReference | null,
  ): Promise<boolean> {
    if (!plan.secretPolicy.required) {
      return client.publicClient === true && secret === null;
    }
    if (!secret || secret.status !== "active") return false;
    const response = await this.#request(
      `${this.#clientPath(client)}/client-secret`,
      { method: "GET" },
      [200],
    );
    let credential = await safeJson<KeycloakCredentialRepresentation>(
      response,
      "client-secret-response-invalid",
    );
    if (
      credential.type !== "secret" ||
      typeof credential.value !== "string"
    ) {
      return false;
    }
    const digest = await sha256(credential.value);
    credential = {};
    return digest === secret.valueDigest;
  }

  async #request(
    path: string,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "invalid-admin-api-path",
        "The Keycloak administration path must be relative.",
      );
    }
    const token = await this.#accessToken();
    if (!token || token.length < 16) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "admin-token-unavailable",
        "A Keycloak administration token is required.",
      );
    }
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new KeycloakIdentityProvisioningAdapterError(
        "keycloak-request-failed",
        "The Keycloak administration request could not be completed.",
      );
    }
    if (!expectedStatuses.includes(response.status)) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "keycloak-response-unexpected",
        `Keycloak returned unexpected status ${response.status}.`,
      );
    }
    return response;
  }

  #clientsPath(): string {
    return `/admin/realms/${encodeURIComponent(this.#realm)}/clients`;
  }

  #clientPath(client: KeycloakClientRepresentation): string {
    if (!client.id) {
      throw new KeycloakIdentityProvisioningAdapterError(
        "client-id-missing",
        "Keycloak did not return the internal client identifier.",
      );
    }
    return `${this.#clientsPath()}/${encodeURIComponent(client.id)}`;
  }
}

export function keycloakIdentityProviderCompatibility():
  IdentityProviderCompatibility {
  const operations: IdentityProvisioningOperation[] = [
    "create",
    "validate",
    "observe",
    "reconcile",
    "rotate",
    "recover",
    "disable",
    "retire",
  ];
  return {
    schemaVersion: "1.0",
    provider: "keycloak",
    adapterVersion: "1.0.0",
    evidenceReviewedAt: "2026-07-28",
    evidenceSources: [
      KEYCLOAK_ADMIN_REST_SOURCE,
      KEYCLOAK_REGISTRATION_SOURCE,
    ],
    modes: ["api"],
    operations,
    clientKinds: [
      "browser-public",
      "api-confidential",
      "identity-link-confidential",
    ],
    authorityGates: operations.map((operation) => ({
      operation,
      requiredAuthority: "tenant-admin",
      interactive: false,
      reasonCode: "keycloak-admin-api-authority",
    })),
    secretKinds: ["none", "client-secret"],
    overlappingRotation: true,
    registrationManagement: true,
    recovery: true,
  };
}

function desiredClient(
  plan: IdentityProvisioningPlan,
  enabled: boolean,
): KeycloakClientRepresentation {
  const publicClient = plan.client.tokenEndpointAuthMethod === "none";
  return {
    clientId: plan.client.clientRef,
    enabled,
    protocol: "openid-connect",
    publicClient,
    clientAuthenticatorType: "client-secret",
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    implicitFlowEnabled: false,
    serviceAccountsEnabled: false,
    authorizationServicesEnabled: false,
    fullScopeAllowed: false,
    redirectUris: [...plan.client.redirectUris],
    webOrigins: [...plan.client.allowedOrigins],
    attributes: {
      "pkce.code.challenge.method": plan.client.pkceRequired
        ? "S256"
        : "",
      "post.logout.redirect.uris":
        plan.client.postLogoutRedirectUris.join("##"),
    },
  };
}

function readPostLogoutUris(
  client: KeycloakClientRepresentation,
): string[] {
  const value = client.attributes?.["post.logout.redirect.uris"];
  return value
    ? value.split("##").filter(Boolean)
    : [];
}

function normalizeObservedClient(
  client: KeycloakClientRepresentation,
): object {
  return {
    clientId: client.clientId ?? null,
    enabled: client.enabled ?? null,
    protocol: client.protocol ?? null,
    publicClient: client.publicClient ?? null,
    clientAuthenticatorType: client.clientAuthenticatorType ?? null,
    standardFlowEnabled: client.standardFlowEnabled ?? null,
    directAccessGrantsEnabled:
      client.directAccessGrantsEnabled ?? null,
    implicitFlowEnabled: client.implicitFlowEnabled ?? null,
    serviceAccountsEnabled: client.serviceAccountsEnabled ?? null,
    authorizationServicesEnabled:
      client.authorizationServicesEnabled ?? null,
    fullScopeAllowed: client.fullScopeAllowed ?? null,
    redirectUris: sorted(client.redirectUris),
    webOrigins: sorted(client.webOrigins),
    postLogoutRedirectUris: sorted(readPostLogoutUris(client)),
  };
}

function validateClient(
  client: KeycloakClientRepresentation,
  expectedClientRef: string,
): KeycloakClientRepresentation {
  if (
    !client ||
    typeof client !== "object" ||
    typeof client.id !== "string" ||
    client.id.length < 3 ||
    client.clientId !== expectedClientRef
  ) {
    throw new KeycloakIdentityProvisioningAdapterError(
      "client-response-invalid",
      "Keycloak returned an invalid client representation.",
    );
  }
  return client;
}

async function safeJson<T>(
  response: Response,
  code: string,
): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new KeycloakIdentityProvisioningAdapterError(
      code,
      "Keycloak returned invalid JSON.",
    );
  }
}

function validateBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new KeycloakIdentityProvisioningAdapterError(
      "invalid-base-url",
      "The Keycloak base URL is invalid.",
    );
  }
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new KeycloakIdentityProvisioningAdapterError(
      "invalid-base-url",
      "Keycloak requires HTTPS except for an explicit loopback evaluation URL.",
    );
  }
  return value.replace(/\/+$/, "");
}

function validateRealm(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,255}$/.test(value)) {
    throw new KeycloakIdentityProvisioningAdapterError(
      "invalid-realm",
      "The Keycloak realm name is invalid.",
    );
  }
  return value;
}

function noRollback(reasonCode: string): IdentityProvisioningRollback {
  return {
    allowed: false,
    restoreState: null,
    reasonCode,
    snapshotDigest: null,
  };
}

function equalSet(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const leftValues = sorted(left);
  const rightValues = sorted(right);
  return leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index]);
}

function sorted(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])].sort((left, right) =>
    left.localeCompare(right)
  );
}

function isVerified(
  observation: IdentityProvisioningObservation,
): boolean {
  return observation.ownershipVerified &&
    observation.issuerVerified &&
    observation.callbacksVerified &&
    observation.permissionsVerified &&
    observation.credentialVerified &&
    observation.clientEnabled;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
