import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export default createScopedVitestConfig(["src/gateway/**/*.test.ts"], {
  exclude: ["src/gateway/session-utils.test.ts"],
});
