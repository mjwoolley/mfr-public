import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/client";
import { authConfig } from "@/lib/auth.config";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Runs before the jwt callback, with the adapter-resolved (DB-backed) user.
      // Always returns true — unmatched users still get a session, but are routed
      // to /unauthorized by page/middleware guards since they'll have no role/shareholder.
      if (!user.id || !user.email) return true;
      const email = user.email.toLowerCase();

      if (adminEmails().includes(email)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: Role.ADMIN },
        });
        return true;
      }

      const shareholder = await prisma.shareholder.findUnique({ where: { email } });
      if (shareholder && !shareholder.userId) {
        await prisma.shareholder.update({
          where: { id: shareholder.id },
          data: { userId: user.id },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { shareholder: true },
        });
        token.role = dbUser?.role ?? Role.SHAREHOLDER;
        token.shareholderId = dbUser?.shareholder?.id ?? null;
      }
      return token;
    },
  },
});
