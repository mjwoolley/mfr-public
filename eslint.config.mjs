// Root placeholder config. Every workspace has its own eslint.config.mjs
// (apps use eslint-config-next; packages use typescript-eslint) and lints
// via its own `lint` script — nothing imports this file. It exists only so
// an ESLint invocation from the repo root has a config to resolve.
const baseConfig = []

export default baseConfig
