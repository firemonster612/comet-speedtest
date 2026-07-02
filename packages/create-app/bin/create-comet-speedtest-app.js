#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cancel, confirm, isCancel, select, text } from "@clack/prompts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = resolve(packageRoot, "dist-templates");
const supportedPackageManagers = ["pnpm", "npm", "yarn", "bun"];

class PromptCancelledError extends Error {
  constructor() {
    super("Prompt cancelled.");
    this.name = "PromptCancelledError";
  }
}

main().catch((error) => {
  if (error instanceof PromptCancelledError) {
    process.exitCode = 1;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const prompt = createPrompt();
  const projectName = cli.target ?? (await promptText(prompt, "Project name"));
  if (!projectName) {
    throw new Error("Project name is required.");
  }
  const mode = cli.mode ?? (await promptMode(prompt));
  const packageManager =
    cli.packageManager ??
    (await promptPackageManager(prompt, detectPackageManager() ?? "pnpm"));
  const brandName =
    mode === "core"
      ? "Comet Speed Test"
      : await promptText(prompt, "Brand name", "Comet Speed Test");
  const endpoints = await promptEndpoints(prompt, cli.endpointKind);
  const result = await promptResultSubmission(prompt);
  const includeNginx =
    endpoints.kind === "nginx" &&
    (cli.nginx ?? (await promptYesNo(prompt, "Include NGINX example files?", true)));
  const install =
    cli.install ?? (await promptYesNo(prompt, "Install dependencies now?", true));
  const git =
    cli.git ?? (await promptYesNo(prompt, "Initialize git repository?", true));

  const root = resolve(projectName);
  const packageName = sanitizePackageName(basename(root));
  await assertAvailableDirectory(root);
  await copyProject(mode, root);
  if (includeNginx) {
    await cp(resolve(templatesRoot, "nginx"), resolve(root, "deploy/nginx"), {
      recursive: true,
    });
  }
  await replacePlaceholders(root, {
    __PROJECT_NAME__: packageName,
    __BRAND_NAME__: brandName,
    __RUN_SCRIPT__: runScriptPrefix(packageManager),
    COMET_PROJECT_NAME: packageName,
  });
  await writePackageManager(root, packageManager);
  await writeRuntimeConfig(root, brandName, endpoints, result);

  if (git) {
    run("git", ["init"], root);
  }
  if (install) {
    run(packageManager, ["install"], root);
  }

  printNextSteps(projectName, install, packageManager);
}

function parseArgs(args) {
  const cli = {
    git: undefined,
    install: undefined,
    mode: undefined,
    nginx: undefined,
    packageManager: undefined,
    target: undefined,
    endpointKind: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source") {
      cli.mode = "source";
    } else if (arg === "--deploy" || arg === "--deployable") {
      cli.mode = "deployable";
    } else if (arg === "--core") {
      cli.mode = "core";
    } else if (arg === "--install") {
      cli.install = true;
    } else if (arg === "--no-install") {
      cli.install = false;
    } else if (arg === "--git") {
      cli.git = true;
    } else if (arg === "--no-git") {
      cli.git = false;
    } else if (arg === "--nginx") {
      cli.nginx = true;
      cli.endpointKind = "nginx";
    } else if (arg === "--no-nginx") {
      cli.nginx = false;
    } else if (arg === "--package-manager" || arg === "--pm") {
      cli.packageManager = requireValue(args, index, arg);
      validatePackageManager(cli.packageManager);
      index += 1;
    } else if (!arg.startsWith("--") && !cli.target) {
      cli.target = arg;
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }
  return cli;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function validatePackageManager(packageManager) {
  if (!supportedPackageManagers.includes(packageManager)) {
    throw new Error(
      `Unsupported package manager "${packageManager}". Choose one of: ${supportedPackageManagers.join(", ")}.`,
    );
  }
}

function createPrompt() {
  return {
    isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    input: process.stdin,
    output: process.stdout,
  };
}

async function promptMode(prompt) {
  return promptSelect(prompt, "What do you want to create?", "deployable", [
    { value: "deployable", label: "Deployable configured app" },
    { value: "source", label: "Source app based on the Comet UI" },
    { value: "core", label: "Minimal custom app using the core library" },
  ]);
}

async function promptPackageManager(prompt, defaultValue) {
  return promptSelect(
    prompt,
    "Which package manager should the project use?",
    defaultValue,
    [
      { value: "pnpm", label: "pnpm" },
      { value: "npm", label: "npm" },
      { value: "yarn", label: "Yarn" },
      { value: "bun", label: "Bun" },
    ],
  );
}

async function promptEndpoints(prompt, endpointKind) {
  if (endpointKind === "nginx") {
    return { kind: "nginx" };
  }
  const kind = await promptSelect(
    prompt,
    "How will speed test endpoints be hosted?",
    "later",
    [
      { value: "later", label: "Configure later" },
      { value: "nginx", label: "Same-origin NGINX" },
      { value: "external", label: "Existing external endpoint URLs" },
    ],
  );
  if (kind === "nginx") {
    return { kind: "nginx" };
  }
  if (kind === "external") {
    return {
      kind: "external",
      download: await promptText(prompt, "Download endpoint URL"),
      upload: await promptText(prompt, "Upload endpoint URL"),
      latency: await promptText(prompt, "Latency endpoint URL", ""),
    };
  }
  return { kind: "later" };
}

async function promptResultSubmission(prompt) {
  const enabled = await promptYesNo(prompt, "Submit completed result records?", false);
  if (!enabled) {
    return { submitUrl: null, includeRawSamples: false };
  }
  return {
    submitUrl: await promptText(prompt, "Result submission URL"),
    includeRawSamples: await promptYesNo(
      prompt,
      "Include raw throughput and latency samples?",
      false,
    ),
  };
}

async function promptText(prompt, label, defaultValue = "") {
  if (!prompt.isInteractive) {
    return defaultValue;
  }
  const answer = await text({
    message: label,
    defaultValue,
    placeholder: defaultValue || undefined,
    input: prompt.input,
    output: prompt.output,
  });
  const value = handlePromptValue(answer).trim();
  return value || defaultValue;
}

async function promptYesNo(prompt, label, defaultValue) {
  if (!prompt.isInteractive) {
    return defaultValue;
  }
  const answer = await confirm({
    message: label,
    initialValue: defaultValue,
    input: prompt.input,
    output: prompt.output,
  });
  return handlePromptValue(answer);
}

async function promptSelect(prompt, label, defaultValue, options) {
  if (!prompt.isInteractive) {
    return defaultValue;
  }
  const answer = await select({
    message: label,
    options,
    initialValue: defaultValue,
    input: prompt.input,
    output: prompt.output,
  });
  return handlePromptValue(answer);
}

function handlePromptValue(value) {
  if (isCancel(value)) {
    cancel("Operation cancelled.");
    throw new PromptCancelledError();
  }
  return value;
}

async function copyProject(mode, root) {
  const source = resolve(templatesRoot, mode);
  await assertDirectory(source, `Missing generated ${mode} template.`);
  await cp(source, root, { recursive: true });
}

async function writeRuntimeConfig(root, brandName, endpoints, result) {
  const config = {
    brand: {
      name: brandName,
      logoUrl: "/logo.svg",
      faviconUrl: "/favicon.svg",
    },
    targets: endpointConfig(endpoints),
    result,
  };
  await mkdir(resolve(root, "public"), { recursive: true });
  await writeFile(
    resolve(root, "public/comet.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function endpointConfig(endpoints) {
  if (endpoints.kind === "external") {
    return {
      download: endpoints.download,
      upload: endpoints.upload,
      ...(endpoints.latency ? { latency: endpoints.latency } : {}),
    };
  }
  return {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
    latency: "/speedtest/latency",
  };
}

async function replacePlaceholders(root, replacements) {
  const files = await collectFiles(root);
  for (const file of files) {
    if (!isTextFile(file)) {
      continue;
    }
    let text = await readFile(file, "utf8");
    for (const [placeholder, value] of Object.entries(replacements)) {
      text = text.replaceAll(placeholder, value);
    }
    await writeFile(file, text);
  }
}

async function writePackageManager(root, packageManager) {
  const packageJsonPath = resolve(root, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageManagerVersion(packageManager);
  if (version) {
    packageJson.packageManager = `${packageManager}@${version}`;
  } else {
    delete packageJson.packageManager;
  }
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function packageManagerVersion(packageManager) {
  const result = spawnSync(packageManager, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent ?? "";
  const match = /^(pnpm|npm|yarn|bun)\//.exec(userAgent);
  return match?.[1] ?? null;
}

function runScriptPrefix(packageManager) {
  if (packageManager === "npm" || packageManager === "bun") {
    return `${packageManager} run`;
  }
  return packageManager;
}

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
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

function isTextFile(file) {
  return /\.(css|html|json|md|svg|ts|tsx|js|conf)$/.test(file);
}

async function assertAvailableDirectory(path) {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      throw new Error(`${path} already exists and is not a directory.`);
    }
    const entries = await readdir(path);
    if (entries.length > 0) {
      throw new Error(`${path} already exists and is not empty.`);
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function assertDirectory(path, message) {
  try {
    if (!(await stat(path)).isDirectory()) {
      throw new Error(message);
    }
  } catch {
    throw new Error(message);
  }
}

function sanitizePackageName(name) {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function printNextSteps(projectName, installed, packageManager) {
  const installStep = installed ? "" : `\n  ${packageManager} install`;
  console.log(`
Created ${projectName}.

Next steps:
  cd ${projectName}${installStep}
  ${runScriptPrefix(packageManager)} dev`);
}
