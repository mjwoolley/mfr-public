import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";

export async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          The Corporation
        </Link>
        {user && (
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/inbox">Inbox</Link>
            <Link href="/reports">Reports</Link>
            {user.role === Role.ADMIN && <Link href="/admin/transactions">Admin</Link>}
            <span className="hidden text-black/50 sm:inline dark:text-white/50">{user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button type="submit" className="underline">
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
