import { requireAuthorized } from "@/lib/authz";
import { getAllShareholderBalances } from "@/lib/ledger";
import { assignShareholderColors } from "@/lib/shareholderColors";
import { formatUSD } from "@/lib/format";

export default async function OwnershipPage() {
  const session = await requireAuthorized();
  const { rows, total } = await getAllShareholderBalances();

  // Largest holder first — the stacked bar, legend, and table share this order.
  const sorted = [...rows].sort((a, b) => Number(b.shares) - Number(a.shares));
  const colors = assignShareholderColors(sorted.map((r) => r.shareholder.id));
  const currentShareholderId = session.user.shareholderId ?? null;

  return (
    <div>
      <h1 className="mb-2 text-4xl">Ownership report</h1>
      <p className="text-muted mb-6 text-[15px]">
        {formatUSD(total.toString())} shares outstanding across {rows.length} shareholder
        {rows.length === 1 ? "" : "s"}.
      </p>

      {rows.length > 0 && (
        <>
          <div
            className="mb-2.5 flex h-[26px] overflow-hidden rounded-full"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            {sorted.map(({ shareholder, shares, percent }) => (
              <span
                key={shareholder.id}
                style={{
                  width: `${total.isZero() ? 0 : (Number(shares) / Number(total)) * 100}%`,
                  background: colors[shareholder.id],
                }}
                title={`${shareholder.name} — ${percent.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="mb-7 flex flex-wrap gap-4">
            {sorted.map(({ shareholder }) => (
              <span key={shareholder.id} className="flex items-center gap-[7px] text-[13px]">
                <span
                  className="h-3 w-3 flex-none rounded-full"
                  style={{ background: colors[shareholder.id] }}
                />
                {shareholder.name}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="card elev-sm bg-white px-5 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="table min-w-[420px]">
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
                      <span
                        className="h-3 w-3 flex-none rounded-full"
                        style={{ background: colors[shareholder.id] }}
                      />
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
