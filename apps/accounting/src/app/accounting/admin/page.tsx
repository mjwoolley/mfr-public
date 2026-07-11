import { redirect } from "next/navigation";

/** The Admin landing forwards to the first sub-view; the seg sub-nav in the
 * layout is the real navigation. */
export default function AdminIndexPage() {
  redirect("/accounting/admin/transactions");
}
