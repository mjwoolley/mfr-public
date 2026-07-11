import Link from "next/link";
import { PortalHeader } from "@mfr/ui";
import { auth, signOut } from "@/lib/auth";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <PortalHeader appName="Accounting" appHref="/accounting/dashboard">
      {user && (
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/accounting/dashboard" className="text-lake-100 transition-colors hover:text-sand-50">
            Dashboard
          </Link>
          <Link href="/accounting/inbox" className="text-lake-100 transition-colors hover:text-sand-50">
            Inbox
          </Link>
          <Link href="/accounting/reports" className="text-lake-100 transition-colors hover:text-sand-50">
            Reports
          </Link>
          {user.isAccountingAdmin && (
            <Link
              href="/accounting/admin/transactions"
              className="text-lake-100 transition-colors hover:text-sand-50"
            >
              Admin
            </Link>
          )}
          {user.isAccountingAdmin && (
            <Link
              href="/accounting/admin/shareholders"
              className="text-lake-100 transition-colors hover:text-sand-50"
            >
              Manage Shareholders
            </Link>
          )}
          <span className="hidden text-lake-200 sm:inline">{user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/accounting/sign-in" });
            }}
          >
            <button
              type="submit"
              className="text-lake-100 underline transition-colors hover:text-sand-50"
            >
              Sign out
            </button>
          </form>
        </nav>
      )}
    </PortalHeader>
  );
}
