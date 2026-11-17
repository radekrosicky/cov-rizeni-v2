import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Dokumenty" };

export default function Page() {
  return <EmptyState title="Dokumenty" purpose="Zde bude: Smlouvy, rozpočty, výkresy a jejich revize." reason="Tato část ještě není naprogramovaná (není součástí etapy V2-1). Nezobrazují se žádná data." />;
}
