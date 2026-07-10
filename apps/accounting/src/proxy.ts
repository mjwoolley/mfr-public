import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith("/accounting/admin");
  if (isAdminRoute) {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/accounting/sign-in", req.nextUrl));
    }
    if (req.auth.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/accounting/unauthorized", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/accounting/admin/:path*"],
};
