import { defineConfig } from "vitest/config";

import { workspaceSourceAliases } from "../../workspace-vite-aliases";

export default defineConfig({
  resolve: {
    alias: workspaceSourceAliases,
  },
  test: {
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
  },
});
