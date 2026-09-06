"use client";

import { useEffect } from "react";

interface CanonicalOriginEnforcerProps {
  canonicalOrigin: string;
  legacyOrigins: string[];
}

export function CanonicalOriginEnforcer({
  canonicalOrigin,
  legacyOrigins,
}: CanonicalOriginEnforcerProps) {
  useEffect(() => {
    if (!legacyOrigins.includes(window.location.origin)) return;
    const target = new URL(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      canonicalOrigin,
    );
    window.location.replace(target.toString());
  }, [canonicalOrigin, legacyOrigins]);

  return null;
}
