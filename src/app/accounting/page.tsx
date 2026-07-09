import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/accounting/sign-in");
  if (session.user.role === Role.ADMIN) redirect("/accounting/admin/transactions");
  if (session.user.shareholderId) redirect("/accounting/dashboard");
  redirect("/accounting/unauthorized");
}
