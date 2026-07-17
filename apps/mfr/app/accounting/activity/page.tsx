import { redirect } from "next/navigation";

/**
 * Activity folded into the Admin area in the Organic redesign (shareholder
 * transparency now lives on the Contributions tab). Kept as a redirect so
 * old links and bookmarks survive; the admin layout still gates the target.
 */
export default function ActivityPage() {
  redirect("/accounting/admin/activity");
}
