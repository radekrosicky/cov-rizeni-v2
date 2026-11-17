import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { codespacesDevOrigins, codespacesServerActionOrigins } from "./src/lib/devOrigins";

// Konfigurace Next.js. Záměrně minimální – každá další volba má mít důvod v komentáři.
// Sestavuje se podle fáze: výjimky pro GitHub Codespaces platí JEN pro vývojový server (`npm run dev`).
export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Nezveřejňovat hlavičku „X-Powered-By: Next.js“.
    poweredByHeader: false,
    // Neskládat automaticky AGENTS.md – pravidla pro práci jsou v CLAUDE.md.
    agentRules: false,
    // Vývojová ikonka Next.js v rohu stránky překrývá obsah na mobilu.
    devIndicators: false,
    // Databáze PGlite se nesmí „balit“ do aplikace – načítá se přímo z node_modules.
    serverExternalPackages: ["@electric-sql/pglite"],
    // Vývojový server smí obsloužit stránku otevřenou přes přesměrovaný port GitHub Codespaces.
    // Mimo Codespaces je seznam prázdný (žádné výjimky). Port zůstává SOUKROMÝ.
    allowedDevOrigins: isDevServer ? codespacesDevOrigins(process.env) : [],
    experimental: {
      serverActions: {
        // Kontrola původu formulářů (ochrana proti CSRF) zůstává zapnutá. Navíc se povolí jen
        // adresa tohoto Codespaces a localhost:3000 – jen ve vývojovém serveru v Codespaces (viz devOrigins.ts).
        allowedOrigins: codespacesServerActionOrigins(process.env, { isDevServer }),
      },
    },
  };
}
