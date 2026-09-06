"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { HeaderMenu } from "./HeaderMenu";

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
 */
export function ProfileMenu({
  accountHref,
  profileHref,
  learnerDataHref,
}: ProfileMenuProps) {
  const { configured, status, account, signIn, signOut } = useAuth();
  const signedIn = status === "signed-in" && Boolean(account);
  const name = account?.displayName ?? account?.primaryEmail ?? null;

  const initials = signedIn && name ? initialsFor(name) : "";
  const trigger = initials ? (
    <span aria-hidden="true" className="profile-initials">
      {initials}
    </span>
  ) : (
    <ProfileIcon />
  );

  return (
    <HeaderMenu
      accessibleLabel={
        signedIn && name ? `Your account, ${name}` : "Account and profile"
      }
      align="end"
      label={trigger}
      triggerClassName="profile-trigger"
    >
      {signedIn && name ? (
        <p className="header-menu-identity">
          <span>Signed in as</span>
          <strong>{name}</strong>
        </p>
      ) : null}
      <ul className="header-menu-list">
        {!signedIn ? (
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
