import type { NextConfig } from "next";
import { codespacesDevOrigins } from "./src/lib/devOrigins";

// Konfigurace Next.js. Záměrně minimální – každá další volba má mít důvod v komentáři.
const nextConfig: NextConfig = {
  // Nezveřejňovat hlavičku „X-Powered-By: Next.js“.
  poweredByHeader: false,
  // Neskládat automaticky AGENTS.md – pravidla pro práci jsou v CLAUDE.md.
  agentRules: false,
  // Vývojová ikonka Next.js v rohu stránky překrývá obsah na mobilu.
  devIndicators: false,
  // Vývojový server smí obsloužit stránku otevřenou přes přesměrovaný port GitHub Codespaces.
  // Mimo Codespaces je seznam prázdný (žádné výjimky). Port zůstává SOUKROMÝ.
  allowedDevOrigins: codespacesDevOrigins(process.env),
};

export default nextConfig;
