// Unified Drizzle schema for the single MFR database. Four domains, disjoint
// table names (identity = Auth.js names; portal = `portal_*`; reservations =
// domain-named; accounting = PascalCase), re-exported together so one Drizzle
// client + one `drizzle-kit push` manage the whole DB.
//
// Cross-domain references (e.g. Shareholder.userId → users.id) stay logical
// (by value), exactly as they were across the four separate databases — no new
// cross-type FKs are introduced.

export * from './identity'
export * from './portal'
export * from './reservations'
export * from './accounting'
