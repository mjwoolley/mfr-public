// The app shell's header + tab row (server component): assembles the tab
// list from the session — inbox badge count, the Contributions visibility
// toggle (lock glyph when admins-only), and the Admin tab for accounting
// admins (portal roles).

import { PortalHeader, AuthStatus, HOME_URL } from "@mfr/ui";
import { canAdminAccounting } from "@mfr/auth";
import { auth, signOut } from "@/lib/accounting/auth";
import { db } from "@/lib/db/client";
import { transactionApproval } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/accounting/settings";
import { ApprovalStatus } from "@/lib/accounting/enums";
import { and, eq, sql } from "drizzle-orm";
import { NavTabs, type NavTab } from "./nav-tabs";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  let tabs: NavTab[] = [];
  if (user) {
    const isAccountingAdmin = canAdminAccounting(user.roles);
    const shareholderId = user.shareholderId;
    const [settings, pendingCount] = await Promise.all([
      getAppSettings(),
      shareholderId
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(transactionApproval)
            .where(
              and(
                eq(transactionApproval.shareholderId, shareholderId),
                eq(transactionApproval.status, ApprovalStatus.PENDING),
              ),
            )
            .then((rows) => Number(rows[0].count))
        : Promise.resolve(0),
    ]);

    tabs = [
      { href: "/accounting/dashboard", label: "Dashboard" },
      { href: "/accounting/inbox", label: "Inbox", badge: pendingCount },
    ];
    // Contributions is visible to everyone unless the admins-only toggle is
    // set — then only admins see it, marked with a lock.
    if (settings.contributionsVisibleToAll || isAccountingAdmin) {
      tabs.push({
        href: "/accounting/contributions",
        label: "Contributions",
        lock: !settings.contributionsVisibleToAll,
      });
    }
    tabs.push(
      { href: "/accounting/ownership", label: "Ownership" },
      { href: "/accounting/expenses", label: "Expenses" },
    );
    if (isAccountingAdmin) {
      tabs.push({ href: "/accounting/admin", label: "Admin" });
    }
  }

  return (
    <>
      <PortalHeader appName="Accounting" appHref="/accounting/dashboard">
        {user && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <AuthStatus
              email={user.email ?? ""}
              onSignOut={async () => {
                "use server";
                await signOut({ redirectTo: HOME_URL });
              }}
            />
          </div>
        )}
      </PortalHeader>
      {user && <NavTabs tabs={tabs} />}
    </>
  );
}
