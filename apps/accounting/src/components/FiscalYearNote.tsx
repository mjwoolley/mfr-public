import { currentFiscalYear, fiscalYearLabel } from "@/lib/fiscalYear";

/**
 * One-line explainer shown on tabs whose figures bucket by fiscal year
 * (Contributions, Expenses), with the current fiscal year as a concrete
 * example.
 */
export function FiscalYearNote() {
  const fy = currentFiscalYear();
  return (
    <p className="text-muted mb-6 max-w-[70ch] text-[13px]">
      The corporation&apos;s fiscal year runs March 1 through the end of February —{" "}
      {fiscalYearLabel(fy)} is March {fy} through February {fy + 1}.
    </p>
  );
}
