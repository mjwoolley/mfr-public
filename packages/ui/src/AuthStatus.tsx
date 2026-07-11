export interface AuthStatusProps {
  /** The signed-in user's email, shown next to the sign-out control. */
  email: string
  /**
   * A bound server action, e.g.
   * `async () => { 'use server'; await signOut({ redirectTo: '/app/login' }) }`.
   * Each app supplies its own, already bound to its own `signOut()` and
   * redirect target.
   */
  onSignOut: () => Promise<void>
}

/**
 * The email badge + sign-out form shared by every app's portal header. Not a
 * client component — it just renders a `<form action={onSignOut}>`, exactly
 * like `PortalHeader` itself is a plain server-renderable component.
 */
export function AuthStatus({ email, onSignOut }: AuthStatusProps) {
  return (
    <>
      <span className="hidden text-sm text-lake-200 sm:inline">{email}</span>
      <form action={onSignOut}>
        <button
          type="submit"
          className="text-sm text-lake-100 underline transition-colors hover:text-sand-50"
        >
          Sign out
        </button>
      </form>
    </>
  )
}
