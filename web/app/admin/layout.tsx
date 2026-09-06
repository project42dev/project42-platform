import type { Metadata } from "next";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: `${orgName} Administration`,
  description: `Administrative console and user management for ${orgName}`,
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-portal-root" data-theme="admin-control" data-layout="admin-dashboard">
      {children}
    </div>
  );
}
