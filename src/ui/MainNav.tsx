"use client";

// Hlavní navigace. Počítač: levý tmavě modrý panel. Mobil: tmavě modrá lišta nahoře
// se třemi velkými tlačítky (pohodlné pro dotyk, bez vodorovného posouvání).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/lib/navigation";

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hlavní navigace" className="px-2 pb-2 md:px-3 md:pb-0">
      <ul className="grid grid-cols-3 gap-1 md:grid-cols-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.description}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center justify-center rounded-md px-2 text-center text-sm font-medium leading-tight transition-colors md:justify-start md:px-3 md:text-left",
                  active ? "bg-nav-active text-white" : "text-slate-300 hover:bg-nav-active/60 hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
