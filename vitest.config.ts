import { defineConfig } from "vitest/config";

// Testes unitários das regras do formulário (os testes de ponta a ponta usam o Playwright).
export default defineConfig({ test: { include: ["lib/**/*.test.ts"] } });
