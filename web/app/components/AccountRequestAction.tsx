"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { headerOffersAccountRequest } from "../lib/headerAccountPresentation";
import { copy } from "../../lib/copy";

/**
 * Where "Request access" goes. The fragment targets the request section on
 * /account, so the reader lands on the explanation rather than on the
 * "Existing learner" card above it. Written down once so the header, the
 * profile menu and the admin header cannot drift apart.
 */
export const ACCOUNT_REQUEST_FRAGMENT = "#request-account";

/**
 * The one-step way to ask for an account.
 *
 * Before this existed, a signed-out visitor's only route to the request was:
 * open the profile menu, read past "Sign in", pick "Account", scroll past the
 * "Existing learner" card. Four steps, none of them named for what was being
 * looked for -- which is why the owner said it took a while to find how to
 * even do that.
 *
 * This is deliberately NOT a second request path. It links to the same
 * /account#request-account section the profile menu has always reached; it
 * only gives it a name and puts it in the header.
 *
 * The three-state rule from lib/headerAccountPresentation applies here for a
 * sharper reason than it does to "Sign in": while the account read is in
 * flight, the reader may be a signed-in, approved learner, and telling them to
 * request an account would be telling them their account does not exist. So
 * nothing renders until the answer settles, and `configured` keeps an
 * unconfigured self-host from advertising a door that opens onto a notice.
 */
export function AccountRequestAction({ href }: { href: string }) {
  const { configured, status, account } = useAuth();
  if (!configured) return null;
  if (!headerOffersAccountRequest(status, account)) return null;
  return (
    <Link className="header-action header-action-quiet" href={href}>
      {copy.account.header.requestAccess}
    </Link>
  );
}
