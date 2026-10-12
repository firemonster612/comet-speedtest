import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";

// Requires dist-templates; the package test script builds them first.
const cliPath = resolve(import.meta.dirname, "../bin/create-comet-speedtest-app.js");
const endpointContractUrl =
  "https://github.com/firemonster612/comet-speedtest/blob/main/docs/library/config.md#targets";

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: "utf8" });
}

describe("help", () => {
  for (const flag of ["--help", "-h"]) {
    test(`${flag} lists modes, flags, and an example`, () => {
      const { status, stdout } = runCli([flag]);

      assert.equal(status, 0);
      assert.match(stdout, /^Usage: create-comet-speedtest-app \[project-name\]/);
      for (const option of [
        "--deploy",
        "--source",
        "--core",
        "--pm, --package-manager <name>",
        "--nginx",
        "--no-install",
        "--no-git",
      ]) {
        assert.ok(stdout.includes(option), `help is missing ${option}`);
      }
      assert.match(stdout, /Modes \(default: --deploy\)/);
      assert.match(stdout, /create-comet-speedtest-app my-speedtest --deploy/);
    });
  }

  test("unknown arguments point at --help", () => {
    const { status, stderr } = runCli(["--frobnicate"]);

    assert.equal(status, 1);
    assert.match(
      stderr,
      /Unknown argument "--frobnicate"\. Run create-comet-speedtest-app --help/,
    );
  });
});

describe("deployable project with endpoints configured later", () => {
  let workDir;
  let result;

  before(async () => {
    workDir = await mkdtemp(join(tmpdir(), "comet-create-app-test-"));
    result = runCli(
      // A leading `--`, as `pnpm create ... -- --deploy` may forward, is ignored.
      ["--", "my-speedtest", "--deploy", "--pm", "pnpm", "--no-install", "--no-git"],
      workDir,
    );
  });

  after(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  test("closing output marks the endpoint URLs as placeholders", () => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /download {2}\/speedtest\/download\/large\.bin {2}\(placeholder\)/,
    );
    assert.match(result.stdout, /upload {4}\/speedtest\/upload {14}\(placeholder\)/);
    assert.match(result.stdout, /latency {3}\/speedtest\/latency {13}\(placeholder\)/);
    assert.ok(result.stdout.includes(endpointContractUrl));
    assert.match(result.stdout, /check and build never contact the endpoints/);
  });

  test("README explains the endpoint requirement and next steps", async () => {
    const readme = await readFile(join(workDir, "my-speedtest/README.md"), "utf8");

    assert.match(readme, /## Speed test endpoints/);
    assert.ok(readme.includes(`[endpoint contract](${endpointContractUrl})`));
    assert.ok(
      readme.includes(
        "[NGINX example](https://github.com/firemonster612/comet-speedtest/tree/main/examples/nginx)",
      ),
    );
    assert.match(
      readme,
      /`check` validates the structure of `public\/comet\.config\.json`\. It does not\s+contact the endpoints/,
    );
    assert.match(readme, /the\s+`targets` URLs are placeholders/);
    assert.match(readme, /"upload": "\/speedtest\/upload"/);
    assert.match(readme, /Run `pnpm check`, then `pnpm build`/);
  });

  test("config holds the placeholder targets the output lists", async () => {
    const config = JSON.parse(
      await readFile(join(workDir, "my-speedtest/public/comet.config.json"), "utf8"),
    );

    assert.deepEqual(config.targets, {
      download: "/speedtest/download/large.bin",
      upload: "/speedtest/upload",
      latency: "/speedtest/latency",
    });
  });
});
