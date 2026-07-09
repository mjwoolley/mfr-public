import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@/generated/prisma/client";

// Edge-safe base config (no adapter, no Prisma import at runtime) so it can be
// shared with middleware.ts. DB-touching callbacks (signIn, jwt) live in auth.ts.
export const authConfig = {
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/accounting/sign-in" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as Role) ?? "SHAREHOLDER";
        session.user.shareholderId = (token.shareholderId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
