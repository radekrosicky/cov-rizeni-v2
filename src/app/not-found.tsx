import Link from "next/link";

// Neexistující adresa mimo aplikaci (bez navigace a bez dat).
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Stránka nenalezena</h1>
        <p className="mt-2 text-sm text-slate-600">Tato adresa v aplikaci neexistuje.</p>
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-dark">
          Na úvodní stránku
        </Link>
      </section>
    </main>
  );
}
