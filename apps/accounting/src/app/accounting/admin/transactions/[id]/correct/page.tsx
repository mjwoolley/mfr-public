import { redirect } from "next/navigation";

/** Corrections moved to a dialog on the Admin → Share transactions view;
 * ?correct= pre-opens it for this transaction. */
export default async function CorrectTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/accounting/admin/transactions?correct=${id}`);
}
