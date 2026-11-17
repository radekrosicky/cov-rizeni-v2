import type { ReactNode } from "react";

export function PageHeader({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {lead && <p className="mt-1 text-sm text-slate-600">{lead}</p>}
      </div>
      {action}
    </header>
  );
}
