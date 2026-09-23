import { defineConfig } from "vitest/config";
import path from "path";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, so lib/*.ts files can
// import each other the same way here as everywhere else in the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
