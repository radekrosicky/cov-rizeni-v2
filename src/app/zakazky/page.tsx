import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";

export const metadata: Metadata = { title: "Zakázky" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="Zakázky" lead="Zakázka je centrální místo – vše ostatní se k ní váže." />
      <EmptyState
        title="Seznam zakázek"
        purpose="Zde bude seznam zakázek a jejich detail s pěti pohledy: Přehled, Materiál, Úkoly, Připravenost a Dokumenty."
        reason="Tato část ještě není naprogramovaná. Zakázky zatím nelze zakládat ani zobrazovat – způsob ukládání dat čeká na schválení."
      />
    </>
  );
}
