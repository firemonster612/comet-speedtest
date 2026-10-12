import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  endpointContractUrl,
  nginxExampleUrl,
  sameOriginTargets,
} from "../bin/endpoint-setup.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const outputRoot = resolve(packageRoot, "dist-templates");
const versions = {
  config: await packageVersion(resolve(workspaceRoot, "packages/config/package.json")),
  core: await packageVersion(resolve(workspaceRoot, "packages/core/package.json")),
  production: await packageVersion(
    resolve(workspaceRoot, "packages/production/package.json"),
  ),
};
const catalog = await workspaceCatalog();
// Every mode reads endpoints from public/comet.config.json and no generated dev
// server provides them, so each README carries the same setup steps.
const endpointSetupSection = `## Speed test endpoints

A test measures against the URLs under \`targets\` in
\`public/comet.config.json\`. Each one needs a real server behind it:

- \`download\` serves a large static file.
- \`upload\` accepts a \`POST\` body and discards it.
- \`latency\` answers a \`HEAD\` or \`GET\` quickly. It is optional and defaults
  to the download URL.

The [endpoint contract](${endpointContractUrl}) has the details, including CORS
for endpoints on another origin.

The \`dev\` and \`preview\` servers only serve the app. They do not provide these
endpoints, so a test cannot produce real results until the endpoints exist.
\`check\` and \`build\` never contact the endpoints, so they pass even when the
endpoints are missing.

If you chose "Configure later" when creating the project (the default), the
\`targets\` URLs are placeholders for same-origin endpoints:

\`\`\`json
${JSON.stringify(sameOriginTargets, null, 2)}
\`\`\`

Next steps:

1. Point \`targets\` at endpoints you already host, or serve the placeholder
   paths from the web server that hosts the app. The optional
   [NGINX example](${nginxExampleUrl}) does this. It is in \`deploy/nginx\` if
   you chose it when creating the project.
2. Run \`__RUN_SCRIPT__ check\`, then \`__RUN_SCRIPT__ build\`, and deploy \`dist\`.
3. Open the deployed app and run a test to confirm the endpoints respond.
`;
const oxfmtConfig = await generatedOxfmtConfig();

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

await createDeployableTemplate();
await createSourceTemplate();
await createCoreTemplate();
await createNginxTemplate();
formatTemplates();

console.log(`Generated create-app templates in ${outputRoot}`);

async function createDeployableTemplate() {
  const root = resolve(outputRoot, "deployable");
  await mkdir(resolve(root, "public"), { recursive: true });
  await writeJson(resolve(root, "package.json"), {
    name: "__PROJECT_NAME__",
    private: true,
    type: "module",
    scripts: {
      dev: "comet-speedtest dev",
      check: "comet-speedtest check",
      build: "comet-speedtest build",
      preview: "comet-speedtest preview",
    },
    dependencies: {
      "@comet-speedtest/production": `^${versions.production}`,
    },
    packageManager: "__PACKAGE_MANAGER__",
  });
  await writeGitignore(root);
  await writeFile(
    resolve(root, "README.md"),
    `# COMET_PROJECT_NAME

Deployable Comet speed test app.

## Commands

\`\`\`sh
__RUN_SCRIPT__ dev
__RUN_SCRIPT__ check
__RUN_SCRIPT__ build
__RUN_SCRIPT__ preview
\`\`\`

- \`dev\` serves the bundled Comet app with your \`public\` files on top.
- \`check\` validates the structure of \`public/comet.config.json\`. It does not
  contact the endpoints.
- \`build\` copies the app and your \`public\` files into \`dist\`.
- \`preview\` serves the built app locally.

Edit \`public/comet.config.json\` to change branding, endpoints, and result
submission.

${endpointSetupSection}`,
  );
  await writeDefaultAssets(root);
}

async function createSourceTemplate() {
  const root = resolve(outputRoot, "source");
  await cp(resolve(workspaceRoot, "apps/production/src"), resolve(root, "src"), {
    recursive: true,
  });
  await cp(resolve(workspaceRoot, "internal/ui/src"), resolve(root, "src/comet-ui"), {
    recursive: true,
  });
  await removeTests(resolve(root, "src"));
  await cp(
    resolve(workspaceRoot, "apps/production/index.html"),
    resolve(root, "index.html"),
  );
  await mkdir(resolve(root, "public"), { recursive: true });
  await rewriteInternalUiImports(resolve(root, "src"));
  await writeSourceProjectFiles(root);
  await writeDefaultAssets(root);
}

async function createCoreTemplate() {
  const root = resolve(outputRoot, "core");
  await mkdir(resolve(root, "src"), { recursive: true });
  await mkdir(resolve(root, "public"), { recursive: true });
  await writeFile(
    resolve(root, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>__BRAND_NAME__</title>
  </head>
  <body>
    <main>
      <h1>__BRAND_NAME__</h1>
      <button id="start" type="button">Start test</button>
      <pre id="output">Ready</pre>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  );
  await writeFile(
    resolve(root, "src/main.ts"),
    `import { loadAndNormalizeConfig } from "@comet-speedtest/config";
import { createSpeedTest } from "@comet-speedtest/core";

const start = document.querySelector<HTMLButtonElement>("#start");
const output = document.querySelector<HTMLPreElement>("#output");

function write(message: string): void {
  if (output) {
    output.textContent = message;
  }
}

start?.addEventListener("click", async () => {
  start.disabled = true;
  write("Loading config...");
  try {
    const config = await loadAndNormalizeConfig({ url: "/comet.config.json" });
    const speedTest = createSpeedTest(config);
    speedTest.on("phase-start", (event) => write(\`Running \${event.phase}...\`));
    const outcome = await speedTest.run();
    write(JSON.stringify(outcome, null, 2));
  } catch (error) {
    write(error instanceof Error ? error.message : String(error));
  } finally {
    start.disabled = false;
  }
});
`,
  );
  await writeCoreProjectFiles(root);
  await writeDefaultAssets(root);
}

async function createNginxTemplate() {
  const root = resolve(outputRoot, "nginx");
  await mkdir(root, { recursive: true });
  await cp(
    resolve(workspaceRoot, "examples/nginx/nginx.conf"),
    resolve(root, "comet-site.conf"),
  );
  await cp(
    resolve(workspaceRoot, "examples/nginx/upload-discard.conf"),
    resolve(root, "upload-discard.conf"),
  );
  await cp(
    resolve(workspaceRoot, "examples/nginx/cors.conf"),
    resolve(root, "cors.conf"),
  );
  await writeFile(
    resolve(root, "README.md"),
    `# Comet NGINX Example

These files are reference snippets for hosting the static app and same-origin
speed test endpoints.

Create a large download file on the server before running real tests:

\`\`\`sh
truncate --size 10G /usr/share/nginx/html/speedtest/download/large.bin
\`\`\`

Install \`upload-discard.conf\` as an NGINX snippet and adapt
\`comet-site.conf\` for your server name and static asset path.
`,
  );
}

async function writeSourceProjectFiles(root) {
  await writeJson(resolve(root, "package.json"), {
    name: "__PROJECT_NAME__",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0",
      build: "tsc -b && vite build",
      preview: "vite preview --host 0.0.0.0",
      lint: "oxlint src vite.config.ts oxlint.config.ts",
      "lint:fix": "oxlint --fix src vite.config.ts oxlint.config.ts",
      fmt: "oxfmt",
      "fmt:check": "oxfmt --check",
      test: "vitest run --passWithNoTests",
      typecheck: "tsc -b --pretty false",
      check:
        "__RUN_SCRIPT__ fmt:check && __RUN_SCRIPT__ lint && __RUN_SCRIPT__ typecheck && __RUN_SCRIPT__ test && __RUN_SCRIPT__ build",
    },
    dependencies: {
      "@base-ui/react": catalogVersion("@base-ui/react"),
      "@comet-speedtest/config": `^${versions.config}`,
      "@comet-speedtest/core": `^${versions.core}`,
      "class-variance-authority": catalogVersion("class-variance-authority"),
      clsx: catalogVersion("clsx"),
      "lucide-react": catalogVersion("lucide-react"),
      react: catalogVersion("react"),
      "react-dom": catalogVersion("react-dom"),
      "tailwind-merge": catalogVersion("tailwind-merge"),
    },
    devDependencies: {
      "@tailwindcss/vite": catalogVersion("@tailwindcss/vite"),
      "@types/node": catalogVersion("@types/node"),
      "@types/react": catalogVersion("@types/react"),
      "@types/react-dom": catalogVersion("@types/react-dom"),
      "@vitejs/plugin-react": catalogVersion("@vitejs/plugin-react"),
      oxfmt: catalogVersion("oxfmt"),
      oxlint: catalogVersion("oxlint"),
      "oxlint-tsgolint": catalogVersion("oxlint-tsgolint"),
      tailwindcss: catalogVersion("tailwindcss"),
      typescript: catalogVersion("typescript"),
      vite: catalogVersion("vite"),
      vitest: catalogVersion("vitest"),
    },
    packageManager: "__PACKAGE_MANAGER__",
  });
  await writeReactFrontendFiles(root);
  await writeFile(
    resolve(root, "README.md"),
    `# COMET_PROJECT_NAME

Source Comet speed test app.

The Comet UI source has been copied into \`src/comet-ui\`. It is now your code to
modify. The app still uses \`@comet-speedtest/core\` and
\`@comet-speedtest/config\` for measurement and runtime config.

## Commands

\`\`\`sh
__RUN_SCRIPT__ dev
__RUN_SCRIPT__ check
__RUN_SCRIPT__ build
__RUN_SCRIPT__ preview
\`\`\`

- \`dev\` starts Vite for local development.
- \`check\` runs formatting, linting, typechecking, tests, and a production build.
- \`build\` creates the static production bundle in \`dist\`.
- \`preview\` serves the built app locally.

## Project layout

- \`src/main.tsx\` boots the app.
- \`src/comet-ui\` contains the copied Comet UI source. Edit this directory when
  changing layout, styling, labels, or controls.
- \`public/comet.config.json\` controls branding, endpoint URLs, target
  selection, and result submission at runtime.
- \`public/logo.svg\` and \`public/favicon.svg\` are the default brand assets.
- \`deploy/nginx\` is present when you chose the NGINX examples during creation.

${endpointSetupSection}
## Source ownership

This template intentionally gives you the UI source instead of depending on a
Comet UI package. Treat \`src/comet-ui\` as application code: rename files,
delete parts you do not need, and adapt it to your product.
`,
  );
}

async function writeCoreProjectFiles(root) {
  await writeJson(resolve(root, "package.json"), {
    name: "__PROJECT_NAME__",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0",
      build: "tsc -b && vite build",
      preview: "vite preview --host 0.0.0.0",
      lint: "oxlint src vite.config.ts oxlint.config.ts",
      "lint:fix": "oxlint --fix src vite.config.ts oxlint.config.ts",
      fmt: "oxfmt",
      "fmt:check": "oxfmt --check",
      typecheck: "tsc -b --pretty false",
      check:
        "__RUN_SCRIPT__ fmt:check && __RUN_SCRIPT__ lint && __RUN_SCRIPT__ typecheck && __RUN_SCRIPT__ build",
    },
    dependencies: {
      "@comet-speedtest/config": `^${versions.config}`,
      "@comet-speedtest/core": `^${versions.core}`,
    },
    devDependencies: {
      "@types/node": catalogVersion("@types/node"),
      oxfmt: catalogVersion("oxfmt"),
      oxlint: catalogVersion("oxlint"),
      "oxlint-tsgolint": catalogVersion("oxlint-tsgolint"),
      typescript: catalogVersion("typescript"),
      vite: catalogVersion("vite"),
    },
    packageManager: "__PACKAGE_MANAGER__",
  });
  await writeCoreFrontendFiles(root);
  await writeFile(
    resolve(root, "README.md"),
    `# COMET_PROJECT_NAME

Minimal Comet core-library example. This project is for building your own speed
test UI with \`@comet-speedtest/core\` and \`@comet-speedtest/config\`.

## Commands

\`\`\`sh
__RUN_SCRIPT__ dev
__RUN_SCRIPT__ check
__RUN_SCRIPT__ build
__RUN_SCRIPT__ preview
\`\`\`

- \`dev\` starts Vite for local development.
- \`check\` runs formatting, linting, typechecking, and a production build.
- \`build\` creates the static production bundle in \`dist\`.
- \`preview\` serves the built app locally.

## Project layout

- \`src/main.ts\` is the complete minimal example. It loads runtime config,
  creates a speed test, listens for progress events, and prints the final
  outcome.
- \`public/comet.config.json\` controls endpoint URLs, target selection, and
  result submission at runtime.
- \`public/logo.svg\` and \`public/favicon.svg\` are placeholder brand assets.
- \`deploy/nginx\` is present when you chose the NGINX examples during creation.

${endpointSetupSection}
## Building your UI

Start in \`src/main.ts\`. Keep the config loading and \`createSpeedTest(config)\`
call, then replace the example DOM updates with your own rendering layer. The
core package owns measurement behavior; this project owns everything about the
user experience around it.
`,
  );
}

async function writeReactFrontendFiles(root) {
  await writeCommonFrontendFiles(root, {
    jsx: "react-jsx",
    oxlintPlugins: ["typescript", "react", "react-hooks"],
    viteConfig: `import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(projectRoot, "src"),
    },
  },
  build: {
    sourcemap: true,
  },
});
`,
  });
}

async function writeCoreFrontendFiles(root) {
  await writeCommonFrontendFiles(root, {
    oxlintPlugins: ["typescript"],
    viteConfig: `import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
  },
});
`,
  });
}

async function writeCommonFrontendFiles(root, { jsx, oxlintPlugins, viteConfig }) {
  await writeGitignore(root);
  await writeFile(resolve(root, ".oxfmtrc.json"), oxfmtConfig);
  const compilerOptions = {
    target: "ES2022",
    useDefineForClassFields: true,
    module: "ESNext",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    moduleResolution: "Bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noFallthroughCasesInSwitch: true,
    noImplicitOverride: true,
    skipLibCheck: true,
    noEmit: true,
    paths: {
      "@/*": ["./src/*"],
    },
  };
  if (jsx) {
    compilerOptions.jsx = jsx;
  }
  await writeJson(resolve(root, "tsconfig.json"), {
    compilerOptions,
    include: ["src", "vite.config.ts"],
  });
  await writeFile(resolve(root, "vite.config.ts"), viteConfig);
  await writeFile(
    resolve(root, "oxlint.config.ts"),
    `import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ${JSON.stringify(oxlintPlugins)},
});
`,
  );
}

async function writeGitignore(root) {
  await writeFile(
    resolve(root, ".gitignore"),
    `node_modules/
dist/
dist-app/
*.log
`,
  );
}

async function writeDefaultAssets(root) {
  await mkdir(resolve(root, "public"), { recursive: true });
  await writeFile(
    resolve(root, "public/logo.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" role="img" aria-label="Comet">
  <circle cx="20" cy="20" r="12" fill="none" stroke="#6dbbdf" stroke-width="6" stroke-linecap="round" stroke-dasharray="56.5 75.4" transform="rotate(135 20 20)" />
  <text x="44" y="26" fill="#0f172a" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700">Comet</text>
</svg>
`,
  );
  await writeFile(
    resolve(root, "public/favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="12" fill="none" stroke="#6dbbdf" stroke-width="5" stroke-linecap="round" stroke-dasharray="56.5 75.4" transform="rotate(135 16 16)" />
</svg>
`,
  );
}

async function rewriteInternalUiImports(root) {
  const files = await collectFiles(root);
  for (const file of files) {
    if (!/\.(css|ts|tsx)$/.test(file)) {
      continue;
    }
    const text = await readFile(file, "utf8");
    await writeFile(
      file,
      text.replaceAll("@comet-speedtest/internal-ui", "@/comet-ui"),
    );
  }
}

async function removeTests(root) {
  const files = await collectFiles(root);
  await Promise.all(
    files
      .filter((file) => /\.test\.(ts|tsx)$/.test(file))
      .map((file) => rm(file, { force: true })),
  );
}

async function collectFiles(root) {
  const entries = await import("node:fs/promises").then((fs) =>
    fs.readdir(root, { withFileTypes: true }),
  );
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function writeJson(path, value) {
  await writeFile(`${path}`, `${JSON.stringify(value, null, 2)}\n`);
}

async function packageVersion(path) {
  return JSON.parse(await readFile(path, "utf8")).version;
}

async function workspaceCatalog() {
  const text = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  const entries = new Map([["pnpm", await packageManagerVersion()]]);
  let inCatalog = false;
  for (const line of text.split("\n")) {
    if (line === "catalog:") {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) {
      continue;
    }
    if (line && !line.startsWith("  ")) {
      break;
    }
    const match = /^  (?:"([^"]+)"|([^:]+)): (.+)$/.exec(line);
    if (match) {
      entries.set(match[1] ?? match[2], match[3]);
    }
  }
  return entries;
}

async function packageManagerVersion() {
  const rootPackage = JSON.parse(
    await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
  );
  const match = /^pnpm@(.+)$/.exec(rootPackage.packageManager ?? "");
  if (!match) {
    throw new Error("Root package.json must declare packageManager as pnpm@<version>.");
  }
  return match[1];
}

function catalogVersion(name) {
  const version = catalog.get(name);
  if (!version) {
    throw new Error(`Missing ${name} in pnpm-workspace.yaml catalog.`);
  }
  return version;
}

async function generatedOxfmtConfig() {
  const config = JSON.parse(
    await readFile(resolve(workspaceRoot, ".oxfmtrc.json"), "utf8"),
  );
  config.ignorePatterns = [
    ...new Set([...(config.ignorePatterns ?? []), "pnpm-workspace.yaml"]),
  ];
  return `${JSON.stringify(config, null, 2)}\n`;
}

function formatTemplates() {
  const result = spawnSync("pnpm", ["exec", "oxfmt", outputRoot], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Failed to format generated templates.");
  }
}
