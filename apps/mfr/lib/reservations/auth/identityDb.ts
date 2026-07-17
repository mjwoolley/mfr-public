// Re-export the app's single identity client. Post-merge the identity tables
// live in the one unified database (DATABASE_URL); this alias is kept so the
// reservations code that imports it doesn't need to change.
export { identityDb } from '@/lib/identityDb'
