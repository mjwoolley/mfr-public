// This app's NextAuth instance from the shared @mfr/auth factory. The
// extendSession hook below attaches the linked Shareholder id — accounting's
// one app-specific session field.

import NextAuth from "next-auth";
import { createAuthConfig, createRolesReaderFromEnv } from "@mfr/auth";
import { identityDb } from "@/lib/accounting/identityDb";
import { db } from "@/lib/db/client";
import { shareholder } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: "/accounting/api/auth",
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME,
    // No `pages.signIn`: accounting no longer hosts a sign-in page — the portal
    // is the sole sign-in surface (gates redirect there). The /api/auth handler
    // stays only to read the shared session.
    getUserRoles: createRolesReaderFromEnv(),
    // Runs on every session read. Portal-wide fields (id, status, admin flags)
    // are attached by the shared config; here we add accounting's own
    // business-DB field: the linked Shareholder. Linking by email happens once
    // — the first time an approved identity user with a matching Shareholder
    // row signs in (moved from the old JWT callback).
    extendSession: async (session, user) => {
      const email = user.email?.toLowerCase();
      let shareholderId: string | null = null;

      if (email) {
        const row = await db.query.shareholder.findFirst({
          where: eq(shareholder.email, email),
        });
        if (row) {
          if (row.userId !== user.id) {
            try {
              await db
                .update(shareholder)
                .set({ userId: user.id })
                .where(eq(shareholder.id, row.id));
            } catch (err) {
              // An admin can now manually link a different shareholder to this
              // same user.id via linkShareholderToUser. If that already
              // happened, this write loses the race — don't let it crash the
              // session callback; just skip the (re)link for this read.
              if ((err as { code?: string })?.code !== "23505") {
                throw err;
              }
            }
          }
          shareholderId = row.id;
        }
      }

      session.user.shareholderId = shareholderId;
    },
  }),
);
