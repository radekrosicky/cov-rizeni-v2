import Link from "next/link";

export default function NotFound() {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Stránka nenalezena</h1>
      <p className="mt-2 text-sm text-slate-600">Tato adresa v aplikaci neexistuje.</p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-dark"
      >
        Zpět na Co dnes řešit
      </Link>
    </section>
  );
}
