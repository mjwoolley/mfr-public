import { redirect } from 'next/navigation'

/** Recording moved to dialogs on the Admin → Share transactions view. */
export default function NewAdjustmentPage() {
  redirect('/accounting/admin/transactions')
}
