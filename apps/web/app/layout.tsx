import type { Metadata } from "next";
import { Bitter, Geist, Geist_Mono } from "next/font/google";
import { PortalHeader, AuthStatus } from "@mfr/ui";
import { auth, signOut } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Miller Family Reunions",
  description: "The Miller family's lake house tools: reservations and accounting.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bitter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PortalHeader>
          <nav className="flex gap-x-5 text-sm text-lake-100">
            <a
              href="https://reservations.millerfamilyreunions.org/reservations"
              className="transition-colors hover:text-sand-50"
            >
              Reservations
            </a>
            <a
              href="https://accounting.millerfamilyreunions.org/accounting"
              className="transition-colors hover:text-sand-50"
            >
              Accounting
            </a>
          </nav>
          {session?.user && (
            <AuthStatus
              email={session.user.email ?? ""}
              onSignOut={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            />
          )}
        </PortalHeader>
        <main className="flex w-full flex-1 flex-col">{children}</main>
        <footer className="border-t border-sand-200 bg-sand-50">
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-stone-500">
            The Miller family &middot; Lake Lure, North Carolina
          </div>
        </footer>
      </body>
    </html>
  );
}
