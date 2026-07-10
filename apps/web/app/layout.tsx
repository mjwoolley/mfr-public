import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Miller Family Reunions",
  description: "The Miller family's lake house tools: accounting and reservations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-x-4 px-4 py-3">
            <a href="/" className="font-semibold">
              Miller Family Reunions
            </a>
            <nav className="flex gap-x-4 text-sm">
              <a href="https://reservations.millerfamilyreunions.org/reservations">
                Reservations
              </a>
              <a href="https://accounting.millerfamilyreunions.org/accounting">
                Accounting
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
