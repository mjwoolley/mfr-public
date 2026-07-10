import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { setShareholderActive } from "@/actions/shareholders";

export default async function AdminShareholdersPage() {
  const shareholders = await prisma.shareholder.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shareholders</h1>
        <Link
          href="/accounting/admin/shareholders/new"
          className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50"
        >
          Add shareholder
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-sand-200">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Login linked</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shareholders.map((s) => (
              <tr key={s.id} className="border-b border-sand-100">
                <td className="py-2">{s.name}</td>
                <td className="py-2">{s.email}</td>
                <td className="py-2">{s.userId ? "Yes" : "Not yet signed in"}</td>
                <td className="py-2">{s.active ? "Active" : "Inactive"}</td>
                <td className="py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await setShareholderActive(s.id, !s.active);
                    }}
                  >
                    <button type="submit" className="underline">
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {shareholders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-500">
                  No shareholders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
