import { redirect } from "next/navigation";

/** Recording moved to dialogs on the Admin → Share transactions view. */
export default function NewContributionPage() {
  redirect("/accounting/admin/transactions");
}
