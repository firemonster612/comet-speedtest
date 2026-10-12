import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Verifies what users install: packs the publishable packages, compiles a consumer
// against the packed config and core, and builds a project from every create-app mode.

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = {
  config: "@comet-speedtest/config",
  core: "@comet-speedtest/core",
  production: "@comet-speedtest/production",
  createApp: "@comet-speedtest/create-app",
};
// Source and core `check` scripts end with a build; the deployable one only
// validates config through the packed production CLI.
const createAppModes = [
  { name: "deployable", args: ["--deploy", "--nginx"], scripts: ["check", "build"] },
  { name: "source", args: ["--source"], scripts: ["check"] },
  { name: "core", args: ["--core"], scripts: ["check"] },
];
const consumerEntryPoints = [
  "@comet-speedtest/config",
  "@comet-speedtest/core",
  "@comet-speedtest/core/diagnostics",
  "@comet-speedtest/core/testing",
];

const tempRoot = await mkdtemp(resolve(tmpdir(), "comet-package-smoke-"));
try {
  run("pnpm", [
    "--filter",
    packageNames.config,
    "--filter",
    packageNames.core,
    "build",
  ]);
  const tarballs = await packPackages(resolve(tempRoot, "tarballs"));
  await checkConsumer(resolve(tempRoot, "consumer"), tarballs);
  const createAppRunner = resolve(tempRoot, "create-app-runner");
  await writePackageJson(createAppRunner, {
    [packageNames.createApp]: `file:${tarballs.createApp}`,
  });
  await installFromTarballs(createAppRunner, tarballs);
  for (const mode of createAppModes) {
    await checkGeneratedProject(
      createAppRunner,
      resolve(tempRoot, mode.name),
      mode,
      tarballs,
    );
  }
  console.log("\nPackage smoke test passed.");
} catch (error) {
  console.error(
    `\nPackage smoke test failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}

async function packPackages(tarballRoot) {
  const tarballs = {};
  for (const [key, name] of Object.entries(packageNames)) {
    const destination = resolve(tarballRoot, key);
    await mkdir(destination, { recursive: true });
    run("pnpm", ["--filter", name, "pack", "--pack-destination", destination]);
    const [tarball] = await readdir(destination);
    if (!tarball) {
      throw new Error(`pnpm pack produced no tarball for ${name}.`);
    }
    tarballs[key] = resolve(destination, tarball);
  }
  return tarballs;
}

async function checkConsumer(root, tarballs) {
  await writePackageJson(root, {
    [packageNames.config]: `file:${tarballs.config}`,
    [packageNames.core]: `file:${tarballs.core}`,
  });
  await installFromTarballs(root, tarballs);
  await copyFile(
    resolve(workspaceRoot, "docs/npm-smoke/consumer.ts"),
    resolve(root, "consumer.ts"),
  );
  // NodeNext is the strictest resolver for `exports` and declaration imports, and
  // skipLibCheck stays off so the packed declarations are checked too.
  await writeJson(resolve(root, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      types: [],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    files: ["consumer.ts"],
  });
  run("pnpm", ["exec", "tsc", "-p", resolve(root, "tsconfig.json")]);
  const imports = consumerEntryPoints.map((entry) => `await import("${entry}");`);
  run("node", ["--input-type=module", "--eval", imports.join(" ")], root);
}

async function checkGeneratedProject(createAppRunner, root, mode, tarballs) {
  run(
    "pnpm",
    [
      "exec",
      "create-comet-speedtest-app",
      root,
      ...mode.args,
      "--pm",
      "pnpm",
      "--no-install",
      "--no-git",
    ],
    createAppRunner,
  );
  await installFromTarballs(root, tarballs);
  for (const script of mode.scripts) {
    run("pnpm", ["run", script], root);
  }
}

async function writePackageJson(root, dependencies) {
  await mkdir(root, { recursive: true });
  await writeJson(resolve(root, "package.json"), {
    name: `comet-smoke-${basename(root)}`,
    private: true,
    type: "module",
    dependencies,
  });
}

// Overrides every @comet-speedtest package with its local tarball, including
// transitive ones such as core's config dependency, so none come from the registry.
async function installFromTarballs(root, tarballs) {
  const overrides = Object.entries(packageNames)
    .map(([key, name]) => `  "${name}": "file:${tarballs[key]}"`)
    .join("\n");
  await writeFile(resolve(root, "pnpm-workspace.yaml"), `overrides:\n${overrides}\n`);
  run("pnpm", ["install", "--prefer-offline"], root);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, cwd = workspaceRoot) {
  console.log(`\n> ${command} ${args.join(" ")}  (in ${cwd})`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `"${command} ${args.join(" ")}" exited with ${result.status} in ${cwd}.`,
    );
  }
}
