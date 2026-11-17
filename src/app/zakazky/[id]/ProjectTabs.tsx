"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pět pohledů detailu zakázky (Master zadání, kap. 3). Funkční je zatím jen Přehled.
const TABS = [
  { slug: "", label: "Přehled" },
  { slug: "/material", label: "Materiál" },
  { slug: "/ukoly", label: "Úkoly" },
  { slug: "/pripravenost", label: "Připravenost" },
  { slug: "/dokumenty", label: "Dokumenty" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/zakazky/${projectId}`;
  return (
    <nav aria-label="Pohledy zakázky" className="mb-5">
      <ul className="flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map((t) => {
          const href = base + t.slug;
          const active = t.slug === "" ? pathname === base || /\/(upravit|udalosti|clenove|historie)/.test(pathname.slice(base.length)) : pathname.startsWith(href);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-2.5 sm:px-3 text-sm font-medium ${active ? "border-accent text-accent-dark" : "border-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
