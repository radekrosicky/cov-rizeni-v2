import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { SignalLegend } from "@/ui/SignalLegend";

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Co dnes řešit" lead="Co musím dnes objednat, zařídit, zkontrolovat nebo urgovat – a proč." />
      <div className="space-y-4">
        <EmptyState
          title="Ranní přehled akcí"
          purpose="Zde bude krátký seznam akcí napříč zakázkami: opožděné nákupy, nepotvrzené dodávky, neověřené nebo nesplněné podmínky, blížící se termíny, úkoly a změny z KD. Každá karta ukáže zakázku, akci, důvod, termín, odpovědného a jedno hlavní tlačítko."
        />
        <SignalLegend />
      </div>
    </>
  );
}
