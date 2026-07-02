import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AliasOptions } from "vite";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

export const workspaceSourceAliases: AliasOptions = [
  {
    find: /^@comet-speedtest\/internal-ui\/styles\.css$/,
    replacement: resolve(workspaceRoot, "internal/ui/src/styles.css"),
  },
  {
    find: /^@comet-speedtest\/internal-ui\/(.+)$/,
    replacement: resolve(workspaceRoot, "internal/ui/src/$1"),
  },
  {
    find: "@comet-speedtest/internal-ui",
    replacement: resolve(workspaceRoot, "internal/ui/src/index.ts"),
  },
  {
    find: /^@comet-speedtest\/core\/diagnostics$/,
    replacement: resolve(workspaceRoot, "packages/core/src/diagnostics.ts"),
  },
  {
    find: /^@comet-speedtest\/core\/testing$/,
    replacement: resolve(workspaceRoot, "packages/core/src/testing.ts"),
  },
  {
    find: "@comet-speedtest/core",
    replacement: resolve(workspaceRoot, "packages/core/src/index.ts"),
  },
  {
    find: "@comet-speedtest/config",
    replacement: resolve(workspaceRoot, "packages/config/src/index.ts"),
  },
];
