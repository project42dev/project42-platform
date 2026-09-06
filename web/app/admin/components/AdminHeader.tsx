"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "../../components/BrandMark";
import { ProfileMenu } from "../../components/ProfileMenu";
import { orgName } from "../../../lib/copy";
import { clientCrossDomainHref } from "../../lib/subdomainLinks";

export function AdminHeader() {
  const pathname = usePathname();

  const isAccounts = pathname === "/admin" || pathname === "/admin/";
  const isLogs = pathname?.startsWith("/admin/logs");
  const isSettings = pathname?.startsWith("/admin/settings");

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a className="brand" href={clientCrossDomainHref("/")} aria-label={`${orgName} home`}>
            <BrandMark />
            <span>
              Project <strong>42</strong>
            </span>
          </a>
          <span
            aria-label={`${orgName} Administration`}
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: "4px",
              background: "rgba(17, 24, 39, 0.08)",
              color: "var(--ink)",
              border: "1px solid rgba(17, 24, 39, 0.15)",
            }}
          >
            Admin Console
          </span>
        </div>

        <nav aria-label="Admin navigation">
          <Link
            aria-current={isAccounts ? "page" : undefined}
            href="/admin"
            style={{
              color: isAccounts ? "var(--ink)" : undefined,
              textDecoration: isAccounts ? "underline" : "none",
            }}
          >
            Accounts &amp; Registrations
          </Link>
          <Link
            aria-current={isLogs ? "page" : undefined}
            href="/admin/logs"
            style={{
              color: isLogs ? "var(--ink)" : undefined,
              textDecoration: isLogs ? "underline" : "none",
            }}
          >
            Audit Logs
          </Link>
          <Link
            aria-current={isSettings ? "page" : undefined}
            href="/admin/settings"
            style={{
              color: isSettings ? "var(--ink)" : undefined,
              textDecoration: isSettings ? "underline" : "none",
            }}
          >
            Security settings
          </Link>
        </nav>

        <div className="header-actions">
          <a
            className="header-action"
            href={clientCrossDomainHref("/")}
            style={{ textDecoration: "none" }}
          >
            ← Exit Console
          </a>
          <ProfileMenu
            accountHref={clientCrossDomainHref("/account")}
            learnerDataHref={clientCrossDomainHref("/learner-data")}
            profileHref={clientCrossDomainHref("/profile")}
          />
        </div>
      </div>
    </header>
  );
}
