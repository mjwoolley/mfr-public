import Link from "next/link";
import { PortalHeader, AuthStatus } from "@mfr/ui";
import { auth, signOut } from "@/lib/auth";

const HOME_URL = "https://millerfamilyreunions.org";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <PortalHeader appName="Accounting" appHref="/accounting/dashboard">
      {user && (
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <a href={HOME_URL} className="text-lake-100 transition-colors hover:text-sand-50">
            Home
          </a>
          <Link href="/accounting/dashboard" className="text-lake-100 transition-colors hover:text-sand-50">
            Dashboard
          </Link>
          <Link href="/accounting/inbox" className="text-lake-100 transition-colors hover:text-sand-50">
            Inbox
          </Link>
          <Link href="/accounting/activity" className="text-lake-100 transition-colors hover:text-sand-50">
            Activity
          </Link>
          <Link href="/accounting/reports" className="text-lake-100 transition-colors hover:text-sand-50">
            Reports
          </Link>
          {user.isAccountingAdmin && (
            <Link
              href="/accounting/admin/shareholders"
              className="text-lake-100 transition-colors hover:text-sand-50"
            >
              Manage Shareholders
            </Link>
          )}
          <AuthStatus
            email={user.email ?? ""}
            onSignOut={async () => {
              "use server";
              await signOut({ redirectTo: "/accounting/sign-in" });
            }}
          />
        </nav>
      )}
    </PortalHeader>
  );
}
