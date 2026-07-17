// Re-export the app's single identity client. Post-merge the identity tables
// live in the one unified database (DATABASE_URL); this alias is kept so the
// accounting routes that import it don't need to change.
export { identityDb } from '@/lib/identityDb'
