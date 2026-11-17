import type { Metadata } from "next";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Materiál" };

export default function Page() {
  return <EmptyState title="Materiál" purpose="Zde bude: Sledované dodávky kritického materiálu, termín objednání a dodání." reason="Tato část ještě není naprogramovaná (není součástí etapy V2-1). Nezobrazují se žádná data." />;
}
