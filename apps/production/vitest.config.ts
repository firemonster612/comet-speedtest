import { defineConfig } from "vitest/config";

import { workspaceSourceAliases } from "../../workspace-vite-aliases";

export default defineConfig({
  resolve: {
    alias: workspaceSourceAliases,
  },
  test: {
    environment: "jsdom",
    exclude: ["dist/**", "node_modules/**"],
    setupFiles: ["../../vitest-react-setup.ts"],
  },
});
