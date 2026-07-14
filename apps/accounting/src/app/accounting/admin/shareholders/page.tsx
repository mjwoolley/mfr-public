import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminShareholdersPage() {
  const shareholders = await prisma.shareholder.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-muted m-0 text-sm">
          Shareholder records — link a login by matching the email they sign in with.
        </p>
        <Link
          href="/accounting/admin/shareholders/new"
          className="btn btn-primary flex-none no-underline"
        >
          Add shareholder
        </Link>
      </div>

      <div className="card elev-sm bg-white px-5 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Login linked</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shareholders.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-muted">{s.email ?? "—"}</td>
                  <td>
                    {s.userId ? (
                      <span className="tag tag-accent-2">Linked</span>
                    ) : (
                      <span className="tag tag-neutral">Not yet signed in</span>
                    )}
                  </td>
                  <td>
                    {s.active ? (
                      <span className="tag tag-accent-2">Active</span>
                    ) : (
                      <span className="tag tag-neutral">Inactive</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/accounting/admin/shareholders/${s.id}/edit`}
                      className="font-semibold underline underline-offset-[3px]"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {shareholders.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted py-6 text-center">
                    No shareholders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
