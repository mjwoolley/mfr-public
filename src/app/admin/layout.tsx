import Link from "next/link";
import { requireAdmin } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // server-side re-check; middleware is only a UX fast path
  return (
    <div>
      <nav className="mb-6 flex gap-4 text-sm">
        <Link href="/admin/transactions" className="underline">
          Activity log
        </Link>
        <Link href="/admin/shareholders" className="underline">
          Shareholders
        </Link>
      </nav>
      {children}
    </div>
  );
}
