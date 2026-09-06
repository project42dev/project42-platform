"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { HeaderMenu, MenuChevron } from "./HeaderMenu";
import { ProfileMenu } from "./ProfileMenu";
import { AdminHeader } from "../admin/components/AdminHeader";
import { copy, galleryUrl } from "../../lib/copy";

export function SiteHeader() {
  const pathname = usePathname();
  const text = copy.chrome.header;

  // If in Admin Console, render dedicated AdminHeader
  if (pathname && pathname.startsWith("/admin")) {
    return <AdminHeader />;
  }

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label={text.homeLabel}>
          <BrandMark />
          <span>
            {text.brandLead}
            <strong>{text.brandStrong}</strong>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/learn">{text.nav.learn}</Link>
          <Link href="/guide">{text.nav.guide}</Link>
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
          <Link className="header-action" href="/learn">
            {text.startLearning}
          </Link>
          <ProfileMenu
            accountHref="/account"
            learnerDataHref="/learner-data"
            profileHref="/profile"
          />
        </div>
      </div>
    </header>
  );
}
