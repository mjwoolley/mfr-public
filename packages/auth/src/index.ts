export { createIdentityDb, type IdentityDb } from './db'
export { createIdentityDbFromEnv } from './identityDbFromEnv'
export { createAuthConfig, type CreateAuthConfigOptions } from './config'
export { createPortalStatusGate, type PortalStatusGatePaths } from './portalStatusGate'
export { users, accounts, sessions, verificationTokens, userStatusEnum } from './schema'
export {
  type UserRoles,
  type RolesReader,
  type ReservationsAdminIdsReader,
  NO_ROLES,
  mapRolesRow,
  createRolesReader,
  createRolesReaderFromEnv,
  createReservationsAdminIdsReader,
  createReservationsAdminIdsReaderFromEnv,
  canManageUsers,
  canManagePortalContent,
  canAdminReservations,
  canAdminAccounting,
} from './roles'
