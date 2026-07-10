import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/accounting/sign-in");
  if (session.user.status === "blocked") redirect("/accounting/blocked");
  if (session.user.status !== "approved") redirect("/accounting/pending");
  if (session.user.isAccountingAdmin) redirect("/accounting/admin/transactions");
  if (session.user.shareholderId) redirect("/accounting/dashboard");
  redirect("/accounting/unauthorized");
}
