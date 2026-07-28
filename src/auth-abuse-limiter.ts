export const AUTH_ABUSE_ROUTES = ["start", "callback"] as const;

export type AuthAbuseRoute = (typeof AUTH_ABUSE_ROUTES)[number];

export interface AuthAbuseLimitRequest {
  installationId: string;
  route: AuthAbuseRoute;
  clientAddress: string;
}

export interface AuthAbuseLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface AuthAbuseLimiter {
  check(input: AuthAbuseLimitRequest): Promise<AuthAbuseLimitDecision>;
}

export interface CloudflareRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CloudflareAuthAbuseBindings {
  perClient?: CloudflareRateLimitBinding;
  perInstallation?: CloudflareRateLimitBinding;
}

export class AuthAbuseLimiterUnavailableError extends Error {
  constructor() {
    super("Authentication abuse protection is unavailable.");
  }
}

export class CloudflareAuthAbuseLimiter implements AuthAbuseLimiter {
  constructor(
    private readonly bindings: CloudflareAuthAbuseBindings,
    private readonly retryAfterSeconds = 60,
  ) {
    if (
      !Number.isSafeInteger(retryAfterSeconds) ||
      retryAfterSeconds < 1 ||
      retryAfterSeconds > 60
    ) {
      throw new Error("Authentication rate-limit recovery must be 1-60 seconds.");
    }
  }

  async check(
    input: AuthAbuseLimitRequest,
  ): Promise<AuthAbuseLimitDecision> {
    const perClient = this.bindings.perClient;
    const perInstallation = this.bindings.perInstallation;
    if (!perClient || !perInstallation) {
      throw new AuthAbuseLimiterUnavailableError();
    }
    const installationId = normalizeInstallationId(input.installationId);
    const clientAddress = normalizeAuthClientAddress(input.clientAddress);
    const installationDigest = await sha256Hex(installationId);
    const clientDigest = await sha256Hex(
      `${installationId}\u0000${clientAddress}`,
    );
    try {
      const [client, installation] = await Promise.all([
        perClient.limit({
          key: `auth:${input.route}:client:${clientDigest}`,
        }),
        perInstallation.limit({
          key: `auth:${input.route}:installation:${installationDigest}`,
        }),
      ]);
      return {
        allowed: client.success && installation.success,
        retryAfterSeconds: this.retryAfterSeconds,
      };
    } catch {
      throw new AuthAbuseLimiterUnavailableError();
    }
  }
}

export function readCloudflareClientAddress(request: Request): string {
  const value = request.headers.get("CF-Connecting-IP");
  if (!value) throw new AuthAbuseLimiterUnavailableError();
  return normalizeAuthClientAddress(value);
}

export function normalizeAuthClientAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 64 ||
    normalized.includes(",") ||
    !/^[0-9a-f:.]+$/.test(normalized)
  ) {
    throw new AuthAbuseLimiterUnavailableError();
  }
  return normalized;
}

function normalizeInstallationId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new AuthAbuseLimiterUnavailableError();
  }
  return normalized;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
