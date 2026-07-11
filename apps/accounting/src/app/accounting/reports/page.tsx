import { redirect } from "next/navigation";

/**
 * The Reports tab became "Ownership" in the Organic redesign (its
 * income/expense chart moved to the Expenses tab). Kept as a redirect so old
 * links and bookmarks survive.
 */
export default function ReportsPage() {
  redirect("/accounting/ownership");
}
