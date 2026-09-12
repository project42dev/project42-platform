"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { HeaderMenu, MenuChevron } from "./HeaderMenu";
import { ProfileMenu } from "./ProfileMenu";
import {
  ACCOUNT_REQUEST_FRAGMENT,
  AccountRequestAction,
} from "./AccountRequestAction";
import { AdminHeader } from "../admin/components/AdminHeader";
import { copy, galleryUrl } from "../../lib/copy";

export function SiteHeader() {
  const pathname = usePathname();
  const text = copy.chrome.header;
  // PHONE NAVIGATION.
  //
  // Above 760px the primary nav is a row and this state is inert -- the CSS
  // shows the nav unconditionally. At or below 760px the row does not fit, and
  // the previous behaviour was to wrap it into a two-column block that ate
  // roughly 330 of the 568 visible pixels on an iPhone SE: you landed on the
  // site and saw navigation, not content. So the nav collapses behind a
  // disclosure there, and the "Start learning" action -- which used to be
  // display:none on every phone -- comes back as the first item inside it.
  //
  // The links stay in the DOM and are hidden with CSS rather than being
  // conditionally rendered, for the same reason HeaderMenu keeps its panel
  // mounted: the link checker, the GitHub Pages export and crawlers all read
  // the server HTML.
  const [navOpen, setNavOpen] = useState(false);

  // A client-side transition would otherwise leave the panel open over the
  // page the reader just navigated to. Adjusted DURING render rather than in an
  // effect: React re-runs this component before committing anything, so the
  // panel is never painted open on the new page, and react-hooks'
  // set-state-in-effect rule is satisfied.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    if (!navOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // A HeaderMenu inside this panel closes itself on Escape and puts focus
      // back on its own trigger. Collapsing the panel around that trigger in
      // the same keystroke would drop a keyboard user at the top of the
      // document, so the inner disclosure gets the key first.
      if ((document.activeElement as HTMLElement | null)?.closest(".header-menu")) return;
      setNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  // If in Admin Console, render dedicated AdminHeader
  if (pathname && pathname.startsWith("/admin")) {
    return <AdminHeader />;
  }

  return (
    <header className="site-header" data-nav-open={navOpen ? "true" : "false"}>
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label={text.homeLabel}>
          <BrandMark />
          <span>
            {text.brandLead}
            <strong>{text.brandStrong}</strong>
          </span>
        </Link>
        <nav aria-label="Primary navigation" id="primary-navigation">
          <Link className="nav-cta" href="/learn">
            {text.startLearning}
          </Link>
          <Link href="/learn">{text.nav.learn}</Link>
          <Link href="/guide" prefetch={false}>{text.nav.guide}</Link>
          <Link href="/guide/diagrams">{text.nav.diagrams}</Link>
          <HeaderMenu
            align="end"
            label={
              <>
                {text.nav.aboutMenu}
                <MenuChevron />
              </>
            }
          >
            <ul className="header-menu-list">
              <li>
                <Link href="/about">{text.aboutMenu.about}</Link>
              </li>
              <li>
                <Link href="/platform">{text.aboutMenu.platform}</Link>
              </li>
              <li>
                <a href={galleryUrl} target="_blank" rel="noopener noreferrer">
                  {text.aboutMenu.gallery}
                </a>
              </li>
              <li>
                <Link href="/releases">{text.aboutMenu.releases}</Link>
              </li>
              <li>
                <Link href="/roadmap">{text.aboutMenu.roadmap}</Link>
              </li>
              <li>
                <Link href="/support">{text.aboutMenu.support}</Link>
              </li>
              <li>
                <Link href="/legal-transparency">{text.aboutMenu.legal}</Link>
              </li>
            </ul>
          </HeaderMenu>
        </nav>
        <div className="header-actions">
          <button
            aria-controls="primary-navigation"
            aria-expanded={navOpen}
            aria-label={text.navMenuLabel}
            className="nav-toggle"
            onClick={() => setNavOpen((current) => !current)}
            type="button"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
              <path
                d="M3 5.5h14M3 10h14M3 14.5h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
          <Link className="header-action" href="/learn">
            {text.startLearning}
          </Link>
          {/* Signed-out only, and only once the account read has settled --
              see AccountRequestAction. Below 760px .header-action is
              display:none, so the phone path is the same item inside the
              profile menu. */}
          <AccountRequestAction href={`/account${ACCOUNT_REQUEST_FRAGMENT}`} />
          <ProfileMenu
            accountHref="/account"
            accountRequestHref={`/account${ACCOUNT_REQUEST_FRAGMENT}`}
            learnerDataHref="/learner-data"
            profileHref="/profile"
          />
        </div>
      </div>
    </header>
  );
}
