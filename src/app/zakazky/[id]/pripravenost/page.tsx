import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Připravenost" };

export default function Page() {
  return <EmptyState title="Připravenost" purpose="Zde bude: Ručně zadané podmínky připravenosti konkrétní etapy (události) a jejich ověření." reason="Tato část ještě není naprogramovaná (není součástí etapy V2-1). Nezobrazují se žádná data." />;
}
