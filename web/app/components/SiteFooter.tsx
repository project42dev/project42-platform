"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteFacts } from "../lib/siteFacts";
import { BrandMark } from "./BrandMark";
import { copy, galleryUrl, orgName } from "../../lib/copy";
import { clientCrossDomainHref } from "../lib/subdomainLinks";

export function SiteFooter() {
  const pathname = usePathname();
  const text = copy.chrome.footer;

  if (pathname?.startsWith("/admin")) {
    return (
      <footer className="site-footer">
        <div className="shell footer-bottom">
          <span>{text.adminNote}</span>
          <span>
            <a href={clientCrossDomainHref("/support")}>{text.links.support}</a>
            {" · "}
            <a href={clientCrossDomainHref("/legal-transparency")}>{text.links.legal}</a>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <div className="brand footer-brand">
            <BrandMark />
            <span>{orgName}</span>
          </div>
          <p>{text.blurb}</p>
        </div>

        <div>
          <strong>{text.exploreHeading}</strong>
          <Link href="/learn/paths">{text.links.paths}</Link>
          <Link href="/guide">{text.links.guide}</Link>
          <Link href="/guide/diagrams">{text.links.diagrams}</Link>
          <a href={galleryUrl}>{text.links.gallery}</a>
        </div>

        <div>
          <strong>{text.projectHeading}</strong>
          <Link href="/about">{text.links.about}</Link>
          <Link href="/platform">{text.links.platform}</Link>
          <Link href="/releases">{text.links.releases}</Link>
          <Link href="/roadmap">{text.links.roadmap}</Link>
          <Link href="/legal-transparency">{text.links.legal}</Link>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>
          Site v{siteFacts.siteVersion} · Platform v{siteFacts.platformVersion} · Content v{siteFacts.contentVersion}
        </span>
        <span>
          <Link href="/legal-transparency">{text.links.legal}</Link>
          {" · "}
          <a href={siteFacts.licenses.software.url}>Code {siteFacts.licenses.software.spdx}</a>
          {" · "}
          <a href={siteFacts.licenses.curriculum.url}>Curriculum {siteFacts.licenses.curriculum.spdx}</a>
        </span>
      </div>
    </footer>
  );
}
