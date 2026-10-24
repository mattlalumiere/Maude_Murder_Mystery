import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// One project per test layer so each can run alone (npm run test:unit, test:contract, ...).
export default defineConfig({
  test: {
    projects: ["unit", "contract", "security", "scale"].map((name) => ({
      resolve: { alias },
      test: {
        name,
        include: [`test/${name}/**/*.test.ts`],
        passWithNoTests: true,
        testTimeout: name === "scale" ? 120_000 : 10_000,
      },
    })),
    coverage: { provider: "v8", include: ["src/lib/**"], reporter: ["text-summary", "json-summary"] },
  },
});
