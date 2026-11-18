import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Úkoly" };

export default function Page() {
  return <EmptyState title="Úkoly" purpose="Zde bude: Úkoly k této zakázce – mikroúkoly i důležité smluvní úkoly." reason="Tato část ještě není naprogramovaná (není součástí etapy V2-1). Nezobrazují se žádná data." />;
}
