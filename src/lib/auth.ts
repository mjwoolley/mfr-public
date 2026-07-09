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
    async jwt({ token, user }) {
      // `user` is only present on first sign-in, and only here (not in the
      // signIn callback) is it guaranteed to be the adapter-persisted DB user
      // — the signIn callback fires before the Prisma adapter creates the
      // user/account rows, so `user.id` there doesn't exist yet for new users.
      if (user?.id && user.email) {
        const email = user.email.toLowerCase();

        if (adminEmails().includes(email)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: Role.ADMIN },
          });
        }

        // Independent of admin status — an admin can also be a shareholder.
        const shareholder = await prisma.shareholder.findUnique({ where: { email } });
        if (shareholder && !shareholder.userId) {
          await prisma.shareholder.update({
            where: { id: shareholder.id },
            data: { userId: user.id },
          });
        }

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
