# @mfr/ui

Shared components and stylesheet for the portal's **"Organic" design system** —
consumed by all three apps as raw TypeScript via `transpilePackages` (no build
step; React 19 peer dependency). A change here ships to every app at once, so
verify all three (CI builds and e2e-tests all of them on each PR).

## Exports

| Export                                                                  | What it is                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PortalHeader`                                                          | The shared header chrome: ridgeline mark + wordmark (always links home) + per-app badge + right-side slot                                                                                                                                                                       |
| `ResponsiveNav`                                                         | The tab-row shell with the mobile hamburger collapse, wrapped by each app's nav                                                                                                                                                                                                 |
| `AuthStatus`                                                            | Email badge + sign-out form (takes a bound server action; server-renderable)                                                                                                                                                                                                    |
| `ModalDialog`                                                           | Native `<dialog>`-based modal — mount-to-open, backdrop-click to close                                                                                                                                                                                                          |
| `RidgelineMark`                                                         | The Lake Lure ridgeline SVG mark                                                                                                                                                                                                                                                |
| `HOME_URL` / `RESERVATIONS_URL` / `ACCOUNTING_URL`, `portalSignInUrl()` | Cross-app links: production defaults, overridable per environment via `NEXT_PUBLIC_HOME_URL` / `NEXT_PUBLIC_RESERVATIONS_URL` / `NEXT_PUBLIC_ACCOUNTING_URL` (build-time inlined). `portalSignInUrl(callbackUrl)` is how the other apps route to the portal's canonical sign-in |
| `@mfr/ui/organic.css`                                                   | The design-system stylesheet — the components' class names (`.card`, `.btn`, `.tag`, `.nav`, …) depend on it; every app imports it in its root layout                                                                                                                           |

Consumption example: `apps/accounting/src/components/nav.tsx`
(PortalHeader + AuthStatus + ResponsiveNav via nav-tabs).
