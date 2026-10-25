import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Usa um Chromium já instalado quando a versão do Playwright não encontra o navegador dela
const chromium = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

// Testes de ponta a ponta do site, rodados por tests/e2e/rodar.sh (sobe banco local, API de teste e o site).
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/e2e/resultados/artefatos",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: process.env.SITE_URL || "http://localhost:3100", locale: "pt-BR", timezoneId: "America/Sao_Paulo",
    launchOptions: chromium ? { executablePath: chromium } : undefined },
});
