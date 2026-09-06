"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { clientCrossDomainHref } from "../../../lib/subdomainLinks";
import { orgName } from "../../../../lib/copy";

export default function GithubIdentityCallbackPage() {
  const { completeGithubLink } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const completionStarted = useRef(false);

  useEffect(() => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    void completeGithubLink()
      .then((returnPath) => {
        window.history.replaceState({}, "", "/account/github/callback/");
        window.location.replace(returnPath);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "GitHub account linking could not be completed.",
        );
      });
  }, [completeGithubLink]);

  return (
    <main className="page-shell shell">
      <section className="profile-card auth-callback" aria-live="polite">
        <p className="eyebrow">Linked accounts</p>
        <h1>
          {error ? "GitHub linking needs attention" : "Connecting GitHub…"}
        </h1>
        <p>
          {error ??
            `${orgName} is verifying GitHub’s response and preserving your existing learner record.`}
        </p>
        {error ? (
          <a className="button button-primary" href={clientCrossDomainHref("/account")}>
            Return to your account
          </a>
        ) : null}
      </section>
    </main>
  );
}
