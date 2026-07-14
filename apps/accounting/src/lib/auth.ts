import NextAuth from "next-auth";
import { createAuthConfig } from "@mfr/auth";
import { identityDb } from "@/lib/identityDb";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

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
    pages: { signIn: "/accounting/sign-in" },
    // Runs on every session read. Portal-wide fields (id, status, admin flags)
    // are attached by the shared config; here we add accounting's own
    // business-DB field: the linked Shareholder. Linking by email happens once
    // — the first time an approved identity user with a matching Shareholder
    // row signs in (moved from the old JWT callback).
    extendSession: async (session, user) => {
      const email = user.email?.toLowerCase();
      let shareholderId: string | null = null;

      if (email) {
        const shareholder = await prisma.shareholder.findUnique({ where: { email } });
        if (shareholder) {
          if (shareholder.userId !== user.id) {
            try {
              await prisma.shareholder.update({
                where: { id: shareholder.id },
                data: { userId: user.id },
              });
            } catch (err) {
              // An admin can now manually link a different shareholder to this
              // same user.id via linkShareholderToUser. If that already
              // happened, this write loses the race — don't let it crash the
              // session callback; just skip the (re)link for this read.
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
                throw err;
              }
            }
          }
          shareholderId = shareholder.id;
        }
      }

      session.user.shareholderId = shareholderId;
    },
  }),
);
