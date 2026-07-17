import { redirect } from 'next/navigation'

/** Recording moved to dialogs on the Admin → Share transactions view. */
export default function NewTransferPage() {
  redirect('/accounting/admin/transactions')
}
