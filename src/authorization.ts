import type { AccountState } from "./identity.js";

export const PROJECT42_AUTHORIZATION_ROLES = ["learner", "owner"] as const;
export type Project42AuthorizationRole =
  (typeof PROJECT42_AUTHORIZATION_ROLES)[number];

export const PROJECT42_AUTHORIZATION_PERMISSIONS = [
  "session:establish",
  "self:account-state",
  "self:data-rights",
  "self:learner-records",
  "installation:owner-administration",
] as const;
export type Project42AuthorizationPermission =
  (typeof PROJECT42_AUTHORIZATION_PERMISSIONS)[number];

export const PROJECT42_AUTHORIZATION_DENIAL_CODES = [
  "authentication_required",
  "account_state_invalid",
  "account_not_approved",
  "installation_scope_invalid",
  "installation_scope_mismatch",
  "role_assignment_invalid",
  "learner_role_required",
  "owner_role_required",
  "self_scope_mismatch",
] as const;
export type Project42AuthorizationDenialCode =
  (typeof PROJECT42_AUTHORIZATION_DENIAL_CODES)[number];

export interface Project42AuthorizationActor {
  authenticated: boolean;
  accountId: unknown;
  installationId: unknown;
  accountState: unknown;
  roles: readonly unknown[];
}

export interface Project42AuthorizationRequest {
  permission: Project42AuthorizationPermission;
  installationId: unknown;
  targetAccountId?: unknown;
}

export type Project42AuthorizationDecision =
  | {
      allowed: true;
      permission: Project42AuthorizationPermission;
      roles: readonly Project42AuthorizationRole[];
    }
  | {
      allowed: false;
      permission: Project42AuthorizationPermission;
      code: Project42AuthorizationDenialCode;
    };

const ACCOUNT_STATES = new Set<AccountState>([
  "pending",
  "approved",
  "rejected",
  "suspended",
  "revoked",
]);

const SELF_PERMISSIONS = new Set<Project42AuthorizationPermission>([
  "self:account-state",
  "self:data-rights",
  "self:learner-records",
]);

function nonEmptyScope(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedRoles(
  roles: readonly unknown[],
): readonly Project42AuthorizationRole[] | null {
  if (!Array.isArray(roles) || roles.length === 0) return null;
  const known = new Set<Project42AuthorizationRole>();
  for (const role of roles) {
    if (
      typeof role !== "string" ||
      !PROJECT42_AUTHORIZATION_ROLES.includes(
        role as Project42AuthorizationRole,
      ) ||
      known.has(role as Project42AuthorizationRole)
    ) {
      return null;
    }
    known.add(role as Project42AuthorizationRole);
  }
  return PROJECT42_AUTHORIZATION_ROLES.filter((role) => known.has(role));
}

function denied(
  permission: Project42AuthorizationPermission,
  code: Project42AuthorizationDenialCode,
): Project42AuthorizationDecision {
  return { allowed: false, permission, code };
}

/**
 * Evaluates the complete provider-neutral Project 42 role and installation
 * boundary. Provider claims, linked identities, contribution credit,
 * repository permissions, CODEOWNERS, and UI state are deliberately absent
 * from this input contract and therefore cannot grant product authority.
 */
export function authorizeProject42Operation(
  actor: Project42AuthorizationActor,
  request: Project42AuthorizationRequest,
): Project42AuthorizationDecision {
  if (!actor.authenticated) {
    return denied(request.permission, "authentication_required");
  }
  if (
    !nonEmptyScope(actor.accountId) ||
    !nonEmptyScope(actor.installationId) ||
    !nonEmptyScope(request.installationId)
  ) {
    return denied(request.permission, "installation_scope_invalid");
  }
  if (actor.installationId !== request.installationId) {
    return denied(request.permission, "installation_scope_mismatch");
  }
  if (
    typeof actor.accountState !== "string" ||
    !ACCOUNT_STATES.has(actor.accountState as AccountState)
  ) {
    return denied(request.permission, "account_state_invalid");
  }
  const roles = normalizedRoles(actor.roles);
  if (!roles) {
    return denied(request.permission, "role_assignment_invalid");
  }
  if (SELF_PERMISSIONS.has(request.permission)) {
    if (
      !nonEmptyScope(request.targetAccountId) ||
      request.targetAccountId !== actor.accountId
    ) {
      return denied(request.permission, "self_scope_mismatch");
    }
  }
  if (
    request.permission === "self:account-state" ||
    request.permission === "self:data-rights"
  ) {
    return { allowed: true, permission: request.permission, roles };
  }
  if (actor.accountState !== "approved") {
    return denied(request.permission, "account_not_approved");
  }
  if (request.permission === "installation:owner-administration") {
    if (!roles.includes("owner")) {
      return denied(request.permission, "owner_role_required");
    }
    return { allowed: true, permission: request.permission, roles };
  }
  if (!roles.some((role) => role === "learner" || role === "owner")) {
    return denied(request.permission, "learner_role_required");
  }
  return { allowed: true, permission: request.permission, roles };
}
