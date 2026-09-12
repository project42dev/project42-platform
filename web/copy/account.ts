// Account request copy.
//
// The owner's report: "the request an account process is unclear... it took me
// a little while to find how to even do that." The request path existed -- it
// has always been on /account -- but nothing in the site named it. The header
// offered "Sign in", which starts the same OIDC flow but reads as something
// only an existing account holder does, and the one route that explains the
// request is reached through a menu item called "Account".
//
// So the words below do two jobs: they put the request where a signed-out
// visitor can see it, and they say -- on the page itself -- what actually
// happens after asking. Everything here is checkable against the Worker:
//
//   * a new identity is written `pending` (createOrRefreshAccount, with
//     DOMAIN_APPROVAL_ENABLED false there is no auto-approval branch);
//   * the pending browser holds only a registration receipt, no session;
//   * the receipt lasts thirty days, or until an owner decides -- whichever
//     comes first, because changeAccountState revokes it (createRegistration-
//     Request, changeAccountState);
//   * an owner decides by PATCHing the account state.
//
// Deliberately absent: any promise about how long a review takes, and any
// promise that a message will arrive. Project 42 publishes no review time, and
// the account-notification outbox is only drained by an explicit owner
// dispatch -- nothing schedules it -- so "we will email you" would be a claim
// the product does not keep. The honest instruction is "come back and sign in
// again", because the second sign-in is genuinely the only signal there is.
export const accountCopy = {
  header: {
    /**
     * The signed-out header action. Named for the thing being asked for --
     * "Sign in" beside it is for people who already have an account, and
     * conflating the two is the defect this copy exists to fix.
     */
    requestAccess: "Request access",
  },
  request: {
    eyebrow: "New learner",
    title: "Request a {org} account",
    intro:
      "{org} accounts are granted by review, not by self-service sign-up. Ask for one here, accept the learner-data terms once, and the owner decides.",
    whatHappensNextHeading: "What happens after you ask",
    /**
     * The mechanics, in the order the person experiences them. Each line is a
     * statement about the running system, not a service commitment.
     */
    steps: [
      "You confirm your email address with the identity provider. It sends a one-time code rather than asking for a password — {org} does not create, store, or require a separate password.",
      "Your request is recorded as pending. It does not sign you in: a pending browser holds a request receipt and nothing else, so hosted progress, scores, transcripts, and badges stay unavailable for now.",
      "The owner reviews the request and either approves or declines it.",
      "If it is approved, you sign in once more — a fresh, secure sign-in — and your learning record starts from there.",
    ],
    waitTimeHeading: "How long it takes",
    waitTime:
      "{org} has not published a review time, so this page will not invent one. Requests are reviewed by one person rather than by a queue with a service level.",
    howYouAreToldHeading: "How you will find out",
    howYouAreTold:
      "By coming back here and signing in — nothing is sent to you automatically, so do not wait for a message. While the request is still open this page shows that it is waiting. Once the owner has decided, the private receipt this browser holds is destroyed on purpose, so the page can only tell you the request is finished and ask you to sign in. That sign-in is the answer: it either lets you in or tells you the request was declined.",
    /**
     * Sits beside the terms checkbox. The consent is the one thing the person
     * gives at request time, so it is stated rather than buried in a link.
     */
    termsLabel:
      "{org} records your learning progress so you can resume where you left off and receive credit for completed work. I understand and agree.",
    submitLabel: "Request an account",
    /** Shown when the request cannot be started because nothing is configured. */
    unavailable:
      "This deployment has not been connected to an account service yet, so there is nothing to request an account on.",
  },
  signIn: {
    eyebrow: "Existing learner",
    title: "Already have an account?",
    body:
      "Sign in to reach your progress, transcript, and account settings. If you have never been approved on {org}, use Request access above instead: signing in records the same pending request, but without the terms acceptance the request form collects.",
    submitLabel: "Sign in",
    browseLabel: "Browse the learning catalog",
  },
};
