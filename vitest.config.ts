import { defineConfig } from "vitest/config";

// Engine tests run in Node independently of the Cloudflare build plugin.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
