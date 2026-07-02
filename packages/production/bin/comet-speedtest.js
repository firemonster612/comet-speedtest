#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { access, cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateConfig } from "@comet-speedtest/config";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledAppDir = resolve(packageRoot, "dist-app");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());

  switch (command) {
    case "build":
      await build(root);
      return;
    case "check":
      await check(root);
      return;
    case "dev":
      await checkBundledApp();
      await serve({
        host: options.host ?? "0.0.0.0",
        port: Number(options.port ?? 4173),
        roots: [resolve(root, "public"), bundledAppDir],
      });
      return;
    case "preview":
      await serve({
        host: options.host ?? "0.0.0.0",
        port: Number(options.port ?? 4173),
        roots: [resolve(root, "dist")],
      });
      return;
    case "help":
      printHelp();
      return;
    default:
      throw new Error(`Unknown command "${command}". Run comet-speedtest help.`);
  }
}

function parseArgs(args) {
  const options = {};
  let command = "help";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--") && command === "help") {
      command = arg;
      continue;
    }
    if (arg === "--host" || arg === "--port" || arg === "--root") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option "${arg}".`);
    }
  }
  return { command, options };
}

async function build(root) {
  await check(root);
  await checkBundledApp();

  const publicDir = resolve(root, "public");
  const distDir = resolve(root, "dist");
  await rm(distDir, { force: true, recursive: true });
  await cp(bundledAppDir, distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true });
  console.log(`Built Comet production app at ${distDir}`);
}

async function check(root) {
  const publicDir = resolve(root, "public");
  const configPath = resolve(publicDir, "comet.config.json");
  await assertDirectory(publicDir, "Missing public directory.");
  await assertFile(configPath, "Missing public/comet.config.json.");

  let parsed;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid public/comet.config.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const result = validateConfig(parsed);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(`${issue.path}: ${issue.message}`);
    }
    throw new Error("public/comet.config.json is invalid.");
  }

  for (const field of result.unknownFields) {
    console.warn(`Unknown config field: ${field}`);
  }
  console.log("public/comet.config.json is valid.");
}

async function serve({ host, port, roots }) {
  for (const root of roots) {
    await assertDirectory(root, `Missing static directory: ${root}`);
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405);
        response.end("Method not allowed");
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const file = await findStaticFile(roots, url.pathname);
      if (!file) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "content-type": mimeTypes.get(extname(file)) ?? "application/octet-stream",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolveServer) => {
    server.listen(port, host, resolveServer);
  });
  console.log(`Comet production app running at http://${host}:${port}/`);
}

async function findStaticFile(roots, pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = decoded === "/" ? "/index.html" : decoded;
  for (const root of roots) {
    const candidate = resolve(root, `.${normalized}`);
    if (!isInside(root, candidate)) {
      continue;
    }
    if (await isFile(candidate)) {
      return candidate;
    }
  }
  if (!extname(normalized)) {
    for (const root of roots) {
      const fallback = resolve(root, "index.html");
      if (await isFile(fallback)) {
        return fallback;
      }
    }
  }
  return null;
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.includes(`..${sep}`));
}

async function checkBundledApp() {
  await assertDirectory(
    bundledAppDir,
    "Missing bundled production app. Rebuild @comet-speedtest/production.",
  );
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

async function assertFile(path, message) {
  try {
    await access(path);
  } catch {
    throw new Error(message);
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`Usage: comet-speedtest <command> [options]

Commands:
  dev       Serve the bundled production app overlaid with ./public
  check     Validate ./public/comet.config.json
  build     Build static files into ./dist
  preview   Serve ./dist

Options:
  --host <host>   Host for dev/preview. Default: 0.0.0.0
  --port <port>   Port for dev/preview. Default: 4173
  --root <path>   Project root. Default: current directory`);
}
