import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ČOV Řízení 2.0", template: "%s · ČOV Řízení 2.0" },
  description: "Jednoduchý pracovní nástroj pro řízení realizací ČOV.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10345c",
};

/** Kořen: jen dokument. Navigace a data jsou v rozvržení (aplikace) – dostupné až po přihlášení. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body className="antialiased">{children}</body>
    </html>
  );
}
