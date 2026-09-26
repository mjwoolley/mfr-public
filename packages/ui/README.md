# @mfr/ui

Shared components and stylesheet for the portal's **"Organic" design system** —
consumed by `apps/mfr` as raw TypeScript via `transpilePackages` (no build
step; React 19 peer dependency).

## Exports

| Export                | What it is                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PortalHeader`        | The shared header chrome: ridgeline mark + wordmark (always links home) + section badge + right-side slot                                                                                          |
| `ResponsiveNav`       | The tab-row shell with the mobile hamburger collapse, wrapped by each section's nav                                                                                                                |
| `AuthStatus`          | Email badge + sign-out form (takes a bound server action; server-renderable)                                                                                                                       |
| `ModalDialog`         | Native `<dialog>`-based modal — mount-to-open, backdrop-click to close                                                                                                                             |
| `RidgelineMark`       | The Lake Lure ridgeline SVG mark                                                                                                                                                                   |
| `HOME_URL`            | The home link `PortalHeader` uses (overridable via `NEXT_PUBLIC_HOME_URL`). `RESERVATIONS_URL` / `ACCOUNTING_URL` / `portalSignInUrl()` are leftovers from the three-app era and unused by the app |
| `@mfr/ui/organic.css` | The design-system stylesheet — the components' class names (`.card`, `.btn`, `.tag`, `.nav`, …) depend on it; the app imports it in its root layout                                                |

Consumption example: `apps/mfr/app/layout.tsx` (PortalHeader + AuthStatus)
and `apps/mfr/app/PortalNav.tsx` (ResponsiveNav).
