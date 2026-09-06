import type { ReactNode } from "react";

export default function AccountLayout({ children }: { children: ReactNode }) {
    // Account request, sign-in, and recovery states must remain reachable
    // before authentication. AccountDashboard enforces private operations.
    return <>{children}</>;
}
