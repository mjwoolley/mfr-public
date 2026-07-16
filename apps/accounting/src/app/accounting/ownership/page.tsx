import { requireAuthorized } from "@/lib/authz";
import { getAllShareholderBalances } from "@/lib/ledger";
import { formatUSD } from "@/lib/format";

export default async function OwnershipPage() {
  const session = await requireAuthorized();
  const { rows, total } = await getAllShareholderBalances();

  // Largest holder first.
  const sorted = [...rows].sort((a, b) => Number(b.shares) - Number(a.shares));
  const currentShareholderId = session.user.shareholderId ?? null;

  return (
    <div>
      <h1 className="mb-2 text-4xl">Ownership report</h1>
      <p className="text-muted mb-6 text-[15px]">
        {formatUSD(total.toString())} shares outstanding across {rows.length} shareholder
        {rows.length === 1 ? "" : "s"}.
      </p>

      <div className="card elev-sm bg-white px-4 pt-2 pb-1 sm:px-5">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ shareholder, shares, percent }) => (
                <tr
                  key={shareholder.id}
                  style={
                    shareholder.id === currentShareholderId
                      ? { background: "var(--color-accent-100)" }
                      : undefined
                  }
                >
                  <td>
                    <span className="flex items-center gap-2.5">
                      {shareholder.name}
                      {shareholder.id === currentShareholderId && (
                        <span className="tag tag-accent px-2 py-0 text-[10px]">You</span>
                      )}
                    </span>
                  </td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatUSD(shares.toString())}
                  </td>
                  <td
                    className="text-right font-semibold"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {percent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontFamily: "var(--font-heading)" }}>
                <td className="pt-3">Total</td>
                <td className="pt-3 text-right">{formatUSD(total.toString())}</td>
                <td className="pt-3 text-right">100.00%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
