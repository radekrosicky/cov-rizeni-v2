import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";

export const metadata: Metadata = { title: "Moje úkoly" };

export default function MyTasksPage() {
  return (
    <>
      <PageHeader title="Moje úkoly" lead="Úkoly přidělené mně napříč zakázkami." />
      <EmptyState
        title="Přidělené úkoly"
        purpose="Zde budou úkoly přidělené přihlášenému uživateli – rychlé mikroúkoly i důležité smluvní úkoly s termínem a odpovědnou osobou."
        reason="Tato část ještě není naprogramovaná. Úkoly zatím nelze vytvářet ani přidělovat; skutečné přihlášení zatím neexistuje."
      />
    </>
  );
}
