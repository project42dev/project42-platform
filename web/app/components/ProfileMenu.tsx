"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { HeaderMenu } from "./HeaderMenu";
import {
  headerAccountName,
  headerAccountPresentation,
  headerOffersRetry,
  headerOffersSignIn,
} from "../lib/headerAccountPresentation";

interface ProfileMenuProps {
  accountHref: string;
  profileHref: string;
  learnerDataHref: string;
}

function ProfileIcon() {
  return (
    <svg aria-hidden="true" className="profile-icon" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="8.2" fill="currentColor" r="3.6" />
      <path
        d="M4.6 20.2c0-3.9 3.3-6.6 7.4-6.6s7.4 2.7 7.4 6.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}

/** First letters of the name, or of the email local part. Never more than two. */
function initialsFor(name: string): string {
  const words = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.slice(0, 2).map((word) => word[0]);
  return letters.join("").toUpperCase();
}

/**
 * The learner's own corner of the header.
 *
 * The menu keeps the shared cross-site destinations in a stable order. The
 * sign-in control depends on session state; protected destinations enforce
 * authentication when opened. An unconfigured self-host can still reach its
 * account entry page without presenting a nonfunctional hosted sign-in action.
 *
 * The trigger shows the learner's initials, or a generic icon when there is no
 * name to take them from. Profile photos were removed in September 2026: they
 * appeared only here and on the account page, and carried an entire
 * object-storage dependency for a single avatar.
 *
 * There are three states here, not two -- see lib/headerAccountPresentation.
 * While the account read is in flight, and when it has failed, the menu says
 * neither "Signed in as" nor "Sign in": the session lives in an HttpOnly
 * cookie this code cannot read, so a failed read is not evidence of being
 * signed out. Offering "Sign in" in that state is what made a signed-in reader
 * sign in again on every visit.
 */
export function ProfileMenu({
  accountHref,
  profileHref,
  learnerDataHref,
}: ProfileMenuProps) {
  const { configured, status, account, signIn, signOut, refreshAccount } =
    useAuth();
  const presentation = headerAccountPresentation(status, account);
  const signedIn = presentation === "signed-in";
  const unknown = presentation === "unknown";
  const name = headerAccountName(status, account);
  const offersSignIn = headerOffersSignIn(status, account);
  const offersRetry = headerOffersRetry(status, account);

  const initials = name ? initialsFor(name) : "";
  // data-account-state is the one stable hook a test -- including the
  // production acceptance spec that runs against the live site -- can read to
  // tell the three states apart from outside the React tree.
  const trigger = (
    <span className="profile-trigger-state" data-account-state={presentation}>
      {initials ? (
        <span aria-hidden="true" className="profile-initials">
          {initials}
        </span>
      ) : (
        <ProfileIcon />
      )}
    </span>
  );

  return (
    <HeaderMenu
      accessibleLabel={
        name
          ? `Your account, ${name}`
          : unknown
            ? "Account and profile, sign-in not confirmed"
            : "Account and profile"
      }
      align="end"
      label={trigger}
      triggerClassName="profile-trigger"
    >
      {name ? (
        <p className="header-menu-identity">
          <span>Signed in as</span>
          <strong>{name}</strong>
        </p>
      ) : null}
      {unknown ? (
        <p className="header-menu-identity" data-account-state="unknown">
          <span>
            {status === "error"
              ? "We could not check whether you are signed in."
              : "Checking whether you are signed in…"}
          </span>
        </p>
      ) : null}
      <ul className="header-menu-list">
        {offersSignIn ? (
          <li>
            {configured ? (
              <button onClick={() => void signIn()} type="button">
                Sign in
              </button>
            ) : (
              <Link href={accountHref}>Sign in</Link>
            )}
          </li>
        ) : null}
        {offersRetry ? (
          <li>
            <button onClick={() => void refreshAccount()} type="button">
              Try again
            </button>
          </li>
        ) : null}
        <li>
          <Link href={profileHref}>My progress</Link>
        </li>
        <li>
          <Link href={accountHref}>Account</Link>
        </li>
        <li>
          <Link href={learnerDataHref}>Learner data</Link>
        </li>
      </ul>
      {configured && signedIn ? (
        <div className="header-menu-footer">
          <button onClick={() => void signOut()} type="button">
            Sign out
          </button>
        </div>
      ) : null}
    </HeaderMenu>
  );
}
