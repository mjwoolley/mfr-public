// Shared base flat-config array. Each app's own eslint.config.mjs imports and
// spreads this, then adds its own app-specific ignores/overrides on top —
// see apps/*/eslint.config.mjs for the actual per-app config in use.
const baseConfig = [];

export default baseConfig;
