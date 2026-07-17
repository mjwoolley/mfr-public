import { createPortalStatusGate } from '@mfr/auth'

// One origin now: the local /sign-in page is the single sign-in surface;
// signed-out users are sent there with a callbackUrl back to reservations.
export const RESERVATIONS_SIGN_IN_URL = `/sign-in?callbackUrl=${encodeURIComponent('/reservations')}`

// Reservations' portal-status gate: no session -> portal sign-in, pending ->
// pending page, blocked -> blocked page. Shared by both the app-shell layout
// and the root page so the redirect paths aren't duplicated across call sites.
export const gatePortalStatus = createPortalStatusGate({
  loginPath: RESERVATIONS_SIGN_IN_URL,
  pendingPath: '/reservations/pending',
  blockedPath: '/reservations/blocked',
})
