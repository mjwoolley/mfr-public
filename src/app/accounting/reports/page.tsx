import { requireAuthorized } from "@/lib/authz";
import { getAllShareholderBalances } from "@/lib/ledger";
import { formatUSD } from "@/lib/format";

export default async function ReportsPage() {
  await requireAuthorized();
  const { rows, total } = await getAllShareholderBalances();

  return (
    <div>
      <h1 className="text-xl font-semibold">Ownership report</h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        {formatUSD(total.toString())} shares outstanding across {rows.length} shareholder
        {rows.length === 1 ? "" : "s"}.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-2">Shareholder</th>
              <th className="py-2 text-right">Shares</th>
              <th className="py-2 text-right">Ownership</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ shareholder, shares, percent }) => (
              <tr key={shareholder.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">{shareholder.name}</td>
                <td className="py-2 text-right">{formatUSD(shares.toString())}</td>
                <td className="py-2 text-right">{percent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{formatUSD(total.toString())}</td>
              <td className="py-2 text-right">100.00%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
