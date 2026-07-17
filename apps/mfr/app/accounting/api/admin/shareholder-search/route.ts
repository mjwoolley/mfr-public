import { NextRequest, NextResponse } from "next/server";
import { ilike } from "drizzle-orm";
import { users } from "@mfr/auth";
import { identityDb } from "@/lib/accounting/identityDb";
import { requireAdmin } from "@/lib/accounting/authz";

// Admin-only lookup against the identity DB by email, used by the Edit
// Shareholder page's link-to-login control. No cross-database join is
// possible (identity users and accounting's Shareholder rows live in
// separate Neon projects), so this queries identityDb directly rather than
// going through Prisma.
export async function GET(request: NextRequest) {
  await requireAdmin();

  const email = request.nextUrl.searchParams.get("email")?.trim();
  if (!email) {
    return NextResponse.json({ users: [] });
  }

  const rows = await identityDb
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(ilike(users.email, `%${email}%`))
    .limit(10);

  return NextResponse.json({ users: rows });
}
