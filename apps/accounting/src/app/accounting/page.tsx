import { redirect } from "next/navigation";
import { canAdminAccounting } from "@mfr/auth";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/accounting/sign-in");
  if (session.user.status === "blocked") redirect("/accounting/blocked");
  if (session.user.status !== "approved") redirect("/accounting/pending");
  if (canAdminAccounting(session.user.roles)) redirect("/accounting/activity");
  if (session.user.shareholderId) redirect("/accounting/dashboard");
  redirect("/accounting/unauthorized");
}
