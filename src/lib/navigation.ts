// Globální navigace (Master zadání, kap. 3): přesně tři položky.
// Detail zakázky bude mít vlastních pět pohledů – nepatří do hlavního menu.

export interface NavItem {
  href: string;
  label: string;
  /** Krátký popis pro čtečky obrazovky a nápovědu */
  description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Co dnes řešit", description: "Ranní seznam akcí napříč zakázkami" },
  { href: "/zakazky", label: "Zakázky", description: "Seznam zakázek a jejich detail" },
  { href: "/moje-ukoly", label: "Moje úkoly", description: "Úkoly přidělené mně" },
];

/** Je položka menu aktivní pro danou adresu? „/“ jen přesně, ostatní i pro podstránky. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
