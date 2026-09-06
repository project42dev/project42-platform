"use client";

import { useEffect } from "react";

interface ServiceWorkerRegistrationProps {
  /** Canonical origin from project42.config.json. */
  canonicalOrigin: string;
}

/**
 * Registers the service worker that makes the portal installable and usable
 * offline.
 *
 * Deliberately scoped to the canonical origin only. A worker registered against
 * `localhost` or a preview host would serve cached responses back to
 * `pages:serve` and to the Playwright suites, so a developer or a CI run could
 * be testing the previous build without any signal that it had happened. The
 * worker exists to help visitors of the published site, and only they get it.
 *
 * There is no update prompt: the worker calls skipWaiting on install and
 * clients.claim on activate, and every published artifact carries its own cache
 * namespace, so a deploy takes effect on the next navigation.
 */
export function ServiceWorkerRegistration({
  canonicalOrigin,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.origin !== canonicalOrigin) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // An unavailable worker must never affect the page: without it the
        // site simply behaves as an ordinary website.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, [canonicalOrigin]);

  return null;
}
