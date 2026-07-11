import { createPortalStatusGate } from '@mfr/auth'

// Reservations' portal-status gate: no session -> login, pending -> pending
// page, blocked -> blocked page. Shared by both the app-shell layout and the
// root page so the redirect paths aren't duplicated across call sites.
export const gatePortalStatus = createPortalStatusGate({
  loginPath: '/reservations/login',
  pendingPath: '/reservations/pending',
  blockedPath: '/reservations/blocked',
})
