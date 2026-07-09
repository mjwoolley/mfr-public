import { auth } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/accounting/sign-in");
  return session;
}

/** Admin, or an unlinked-but-allowed account. Redirects unauthorized users away. */
export async function requireAuthorized() {
  const session = await requireSession();
  const { role, shareholderId } = session.user;
  if (role !== Role.ADMIN && !shareholderId) redirect("/accounting/unauthorized");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== Role.ADMIN) redirect("/accounting/unauthorized");
  return session;
}

/** A signed-in, linked shareholder (admins are not necessarily shareholders). */
export async function requireShareholder() {
  const session = await requireSession();
  if (!session.user.shareholderId) redirect("/accounting/unauthorized");
  return session as typeof session & { user: { shareholderId: string } };
}
