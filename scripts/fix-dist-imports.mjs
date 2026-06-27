import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error("Usage: node scripts/fix-dist-imports.mjs <dist-dir> [...]");
  process.exit(1);
}

for (const root of roots) {
  await rewriteDirectory(resolve(root));
}

async function rewriteDirectory(directory) {
  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      await rewriteDirectory(path);
      continue;
    }
    if (!path.endsWith(".js") && !path.endsWith(".d.ts")) {
      continue;
    }
    await rewriteFile(path);
  }
}

async function rewriteFile(path) {
  const source = await readFile(path, "utf8");
  const rewritten = source
    .replace(
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_match, before, specifier, after) => {
        return `${before}${withJsExtension(path, specifier)}${after}`;
      },
    )
    .replace(
      /(import\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_match, before, specifier, after) => {
        return `${before}${withJsExtension(path, specifier)}${after}`;
      },
    )
    .replace(
      /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_match, before, specifier, after) => {
        return `${before}${withJsExtension(path, specifier)}${after}`;
      },
    );

  if (rewritten !== source) {
    await writeFile(path, rewritten);
  }
}

function withJsExtension(importer, specifier) {
  if (extname(specifier) !== "") {
    return specifier;
  }
  const target = resolve(dirname(importer), `${specifier}.js`);
  return existsSync(target) ? `${specifier}.js` : specifier;
}
