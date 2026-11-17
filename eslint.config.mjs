import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"]),
  {
    // Hranice vrstev: doménová logika nesmí záviset na obrazovkách, frameworku ani databázi.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "next", "next/*"], message: "Doména nesmí záviset na Reactu ani Next.js." },
            { group: ["@/app/*", "@/ui/*", "@/server/*", "**/app/**", "**/ui/**", "**/server/**"], message: "Doména nesmí importovat obrazovky ani serverovou vrstvu." },
            { group: ["node:*", "fs", "path"], message: "Doména má být čistá (bez souborů, sítě, databáze)." },
          ],
        },
      ],
    },
  },
]);
