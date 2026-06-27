import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { workspaceSourceAliases } from "../../workspace-vite-aliases";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: workspaceSourceAliases,
  },
  build: {
    chunkSizeWarningLimit: 600,
    sourcemap: true,
  },
});
