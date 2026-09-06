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

// These are raw <a href> targets rather than <Link>, because they can cross an
// origin. next.config.ts's trailingSlash rewrites the router's links but never
// touches a plain anchor, so the canonical form is applied here. This is the
// one place every cross-origin anchor on the site is built, so it is the one
// place that has to remember.
function canonicalPath(path: string): string {
  const [pathname] = path.split(/(?=[?#])/);
  if (pathname.endsWith("/") || /\.[a-z0-9]+$/i.test(pathname)) return path;
  return `${pathname}/${path.slice(pathname.length)}`;
}

export function clientCrossDomainHref(path: string): string {
  const target = canonicalPath(path);
  const ownerOrigin = ownerOriginForPath(path);
  if (typeof window === "undefined") {
    return ownerOrigin === PUBLIC_ORIGIN ? target : `${ownerOrigin}${target}`;
  }
  return window.location.origin === ownerOrigin
    ? target
    : `${ownerOrigin}${target}`;
}
