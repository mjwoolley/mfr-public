// The portal-wide fields (id, status, roles) are declared by @mfr/auth on
// AppSessionUser. This app adds its own per-app session field — the linked
// Shareholder — by augmenting the same interface; it merges cleanly into
// Session.user (see @mfr/auth/types).
import "@mfr/auth/types";

declare module "next-auth" {
  interface AppSessionUser {
    shareholderId: string | null;
  }
}
