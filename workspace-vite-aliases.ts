import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AliasOptions } from "vite";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

export const workspaceSourceAliases: AliasOptions = [
  {
    find: /^@lightspeed\/ui\/styles\.css$/,
    replacement: resolve(workspaceRoot, "packages/ui/src/styles.css"),
  },
  {
    find: /^@lightspeed\/ui\/(.+)$/,
    replacement: resolve(workspaceRoot, "packages/ui/src/$1"),
  },
  {
    find: "@lightspeed/ui",
    replacement: resolve(workspaceRoot, "packages/ui/src/index.ts"),
  },
  {
    find: /^@lightspeed\/core\/diagnostics$/,
    replacement: resolve(workspaceRoot, "packages/core/src/diagnostics.ts"),
  },
  {
    find: /^@lightspeed\/core\/testing$/,
    replacement: resolve(workspaceRoot, "packages/core/src/testing.ts"),
  },
  {
    find: "@lightspeed/core",
    replacement: resolve(workspaceRoot, "packages/core/src/index.ts"),
  },
  {
    find: "@lightspeed/config",
    replacement: resolve(workspaceRoot, "packages/config/src/index.ts"),
  },
];
