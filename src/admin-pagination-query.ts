export interface AdminAccountPageQueryShape {
  stateFiltered: boolean;
  positioned: boolean;
}

/**
 * Builds the tenant-scoped account keyset query used by both D1 and the
 * PostgreSQL compatibility adapter. Keeping the production SQL in one internal
 * module lets deterministic plan tests explain the exact statement executed by
 * the repository.
 */
export function buildAdminAccountPageQuery(
  shape: AdminAccountPageQueryShape,
): string {
  const conditions = [
    "u.installation_id = ?",
    `NOT EXISTS (
      SELECT 1
        FROM account_merge_aliases m
       WHERE m.installation_id = u.installation_id
         AND m.source_user_id = u.id
    )`,
  ];
  if (shape.stateFiltered) {
    conditions.push("u.account_state = ?");
  }
  if (shape.positioned) {
    conditions.push("(u.created_at, u.id) > (?, ?)");
  }
  return `SELECT u.id, u.installation_id, i.provider, i.issuer, i.subject,
                 u.display_name,
                 u.primary_email, u.email_verified, u.account_state,
                 u.created_at, u.updated_at,
                 (
                   SELECT GROUP_CONCAT(ra.role)
                     FROM role_assignments ra
                    WHERE ra.installation_id = u.installation_id
                      AND ra.user_id = u.id
                 ) AS roles
            FROM users u
            JOIN user_identities i
              ON i.installation_id = u.installation_id AND i.user_id = u.id
             AND i.status = 'active' AND i.is_primary = 1
           WHERE ${conditions.join(" AND ")}
           ORDER BY u.created_at ASC, u.id ASC
           LIMIT ?`;
}

/**
 * Builds the tenant-scoped audit keyset query executed by both supported SQL
 * adapters. Audit sequence is unique and monotonically increasing.
 */
export function buildAdminAuditPageQuery(positioned: boolean): string {
  return `SELECT sequence, id, actor_user_id, action, target_type, target_id,
                 request_id, outcome, reason, metadata_json, occurred_at
            FROM audit_events
           WHERE installation_id = ?
             ${positioned ? "AND sequence < ?" : ""}
           ORDER BY sequence DESC
           LIMIT ?`;
}
