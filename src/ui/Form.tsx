"use client";

// Formulář napojený na serverovou akci. „Uloženo“ se ukáže až po potvrzení serverem (S11);
// při chybě (i při výpadku sítě) zůstane formulář vyplněný a zobrazí se jasné hlášení.
import { createContext, useActionState, useContext, useTransition, type FormEvent, type ReactNode } from "react";
import type { FormState } from "./formState";
import { btnPrimary, inputCls } from "./styles";

const ErrorsCtx = createContext<Record<string, string>>({});

export function ActionForm({
  action,
  children,
  submitLabel,
  submitClassName = btnPrimary,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel: string;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    try {
      return await action(prev, fd);
    } catch (e) {
      // Přesměrování po úspěchu nechat projít; skutečnou chybu (např. síť) ukázat – nic nepředstírat.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
      return { ok: false, message: "Změnu se nepodařilo odeslat (chyba spojení nebo serveru). NIC NEBYLO ULOŽENO – zkuste to znovu.", fieldErrors: {} };
    }
  }, null);
  const [, startTransition] = useTransition();
  // Odeslání přes onSubmit (ne přes `action`): React by jinak po každém odeslání formulář vyprázdnil
  // a uživatel by při chybě přišel o zadané údaje.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state && !state.ok && (
        <div role="alert" className="rounded-md border border-red-200 bg-signal-problem-bg px-3 py-2 text-sm font-medium text-signal-problem">
          {state.message}
        </div>
      )}
      <ErrorsCtx.Provider value={state?.fieldErrors ?? {}}>{children}</ErrorsCtx.Provider>
      <SubmitButton label={submitLabel} className={submitClassName} pending={pending} />
    </form>
  );
}

function SubmitButton({ label, className, pending }: { label: string; className: string; pending: boolean }) {
  return (
    <button type="submit" className={`${className} w-full sm:w-auto`} disabled={pending}>
      {pending ? "Ukládám…" : label}
    </button>
  );
}

function FieldShell({ name, label, hint, children }: { name: string; label: string; hint?: string; children: ReactNode }) {
  const error = useContext(ErrorsCtx)[name];
  return (
    <div>
      <label htmlFor={`f-${name}`} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`e-${name}`} className="mt-1 text-sm font-medium text-signal-problem">
          {error}
        </p>
      )}
    </div>
  );
}

function useInvalid(name: string) {
  const error = useContext(ErrorsCtx)[name];
  return error ? { "aria-invalid": true as const, "aria-describedby": `e-${name}` } : {};
}

export function TextField(props: { name: string; label: string; defaultValue?: string | null; hint?: string; required?: boolean; type?: "text" | "date" }) {
  const invalid = useInvalid(props.name);
  return (
    <FieldShell name={props.name} label={props.label + (props.required ? " *" : "")} hint={props.hint}>
      <input id={`f-${props.name}`} name={props.name} type={props.type ?? "text"} defaultValue={props.defaultValue ?? ""} className={inputCls} {...invalid} />
    </FieldShell>
  );
}

export function TextArea(props: { name: string; label: string; defaultValue?: string | null; hint?: string; required?: boolean }) {
  const invalid = useInvalid(props.name);
  return (
    <FieldShell name={props.name} label={props.label + (props.required ? " *" : "")} hint={props.hint}>
      <textarea id={`f-${props.name}`} name={props.name} rows={3} defaultValue={props.defaultValue ?? ""} className={`${inputCls} py-2`} {...invalid} />
    </FieldShell>
  );
}

export function SelectField(props: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
  required?: boolean;
}) {
  const invalid = useInvalid(props.name);
  return (
    <FieldShell name={props.name} label={props.label + (props.required ? " *" : "")} hint={props.hint}>
      <select id={`f-${props.name}`} name={props.name} defaultValue={props.defaultValue ?? ""} className={inputCls} {...invalid}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField(props: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
        <input type="checkbox" name={props.name} defaultChecked={props.defaultChecked} className="h-5 w-5 rounded border-slate-300 text-accent" />
        {props.label}
      </label>
      {props.hint && <p className="text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}
