import { PortalHeader, AuthStatus } from "@mfr/ui";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { ApprovalStatus } from "@/generated/prisma/client";
import { NavTabs, type NavTab } from "./nav-tabs";

const HOME_URL = "https://millerfamilyreunions.org";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  let tabs: NavTab[] = [];
  if (user) {
    const [settings, pendingCount] = await Promise.all([
      getAppSettings(),
      user.shareholderId
        ? prisma.transactionApproval.count({
            where: { shareholderId: user.shareholderId, status: ApprovalStatus.PENDING },
          })
        : Promise.resolve(0),
    ]);

    tabs = [
      { href: "/accounting/dashboard", label: "Dashboard" },
      { href: "/accounting/inbox", label: "Inbox", badge: pendingCount },
    ];
    // Contributions is visible to everyone unless the admins-only toggle is
    // set — then only admins see it, marked with a lock.
    if (settings.contributionsVisibleToAll || user.isAccountingAdmin) {
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
    if (user.isAccountingAdmin) {
      tabs.push({ href: "/accounting/admin", label: "Admin" });
    }
  }

  return (
    <>
      <PortalHeader appName="Accounting" appHref="/accounting/dashboard">
        {user && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <a href={HOME_URL}>Home</a>
            <AuthStatus
              email={user.email ?? ""}
              onSignOut={async () => {
                "use server";
                await signOut({ redirectTo: "/accounting/sign-in" });
              }}
            />
          </div>
        )}
      </PortalHeader>
      {user && <NavTabs tabs={tabs} />}
    </>
  );
}
