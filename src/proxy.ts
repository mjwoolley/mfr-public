import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");
  if (isAdminRoute) {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
    }
    if (req.auth.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/unauthorized", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*"],
};
