import config from "../../project42.config.json";

// Public learner routes belong to the portal's canonical origin. Privileged
// administration routes belong to the isolated Admin console on its own
// origin. Both used to be module constants naming project-42.dev and
// admin.project-42.dev -- product code with one deployment welded into it,
// duplicating values project42.config.json already carries.
export const PUBLIC_ORIGIN = config.portal.canonicalOrigin;
export const ADMIN_ORIGIN = config.portal.adminOrigin;

function ownerOriginForPath(path: string): string {
  return path === "/admin" || path.startsWith("/admin/")
    ? ADMIN_ORIGIN
    : PUBLIC_ORIGIN;
}

export function clientCrossDomainHref(path: string): string {
  const ownerOrigin = ownerOriginForPath(path);
  if (typeof window === "undefined") {
    return ownerOrigin === PUBLIC_ORIGIN ? path : `${ownerOrigin}${path}`;
  }
  return window.location.origin === ownerOrigin ? path : `${ownerOrigin}${path}`;
}
