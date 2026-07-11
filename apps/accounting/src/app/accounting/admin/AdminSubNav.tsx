"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/accounting/admin/transactions", label: "Share transactions" },
  { href: "/accounting/admin/expenses", label: "Expenses" },
  { href: "/accounting/admin/shareholders", label: "Shareholders" },
  { href: "/accounting/admin/activity", label: "Activity" },
];

/** Seg-pill sub-nav across the accounting Admin area. */
export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <div className="seg mb-6 flex-wrap" style={{ background: "var(--color-surface)" }}>
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            className="seg-opt font-semibold no-underline"
            style={
              active
                ? { background: "var(--color-accent)", color: "var(--color-bg)" }
                : { color: "var(--color-text)" }
            }
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
