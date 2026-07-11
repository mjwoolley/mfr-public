import type { Metadata } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import { PortalHeader, AuthStatus } from "@mfr/ui";
import { auth, signOut } from "@/lib/auth";
import "./globals.css";

const caprasimo = Caprasimo({
  variable: "--font-caprasimo",
  weight: "400",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
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
      className={`${caprasimo.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PortalHeader>
          <nav className="flex gap-x-5 text-sm">
            <a href="https://reservations.millerfamilyreunions.org/reservations">
              Reservations
            </a>
            <a href="https://accounting.millerfamilyreunions.org/accounting">
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
        <footer>
          <div
            className="mx-auto max-w-5xl px-4 pt-12 pb-10 text-center text-[13px]"
            style={{ color: "var(--color-neutral-600)" }}
          >
            Lake Lure, North Carolina &middot; A Miller family corporation
          </div>
        </footer>
      </body>
    </html>
  );
}
