// Admin edit-shareholder page: name/email/active form plus the control that
// links a Shareholder record to a Google login in the shared identity DB.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { users } from "@mfr/auth";
import { db } from "@/lib/db/client";
import { shareholder as shareholderTable } from "@/lib/db/schema";
import { identityDb } from "@/lib/accounting/identityDb";
import { EditShareholderForm } from "./edit-shareholder-form";
import { LinkLoginControl } from "./link-login-control";

export default async function EditShareholderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shareholder = await db.query.shareholder.findFirst({
    where: eq(shareholderTable.id, id),
  });
  if (!shareholder) notFound();

  // No cross-database join is possible (Shareholder.userId is a plain string,
  // not a real FK, since users live in the separate identity database) — look
  // the linked user up by id directly against identityDb.
  let linkedEmail: string | null = null;
  if (shareholder.userId) {
    const [linkedUser] = await identityDb
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, shareholder.userId));
    linkedEmail = linkedUser?.email ?? null;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Edit shareholder</h1>
      <EditShareholderForm shareholder={shareholder} />
      <LinkLoginControl shareholderId={shareholder.id} linkedEmail={linkedEmail} />
    </div>
  );
}
