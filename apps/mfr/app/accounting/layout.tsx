import { Nav } from "@/components/accounting/nav";

export default function AccountingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
