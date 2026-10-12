import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, test } from "node:test";

// Requires a built @comet-speedtest/config; the package test script builds it first.
const cliPath = resolve(import.meta.dirname, "../bin/comet-speedtest.js");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

describe("help", () => {
  for (const args of [["--help"], ["-h"], ["help"], [], ["dev", "--help"]]) {
    test(`comet-speedtest ${args.join(" ")} prints usage`, () => {
      const { status, stdout } = runCli(args);

      assert.equal(status, 0);
      assert.match(stdout, /^Usage: comet-speedtest <command> \[options\]/);
      for (const entry of [
        "dev",
        "check",
        "build",
        "preview",
        "--host",
        "--port",
        "--root",
      ]) {
        assert.ok(stdout.includes(`  ${entry} `), `help is missing ${entry}`);
      }
      assert.match(stdout, /--port <port> {3}Port for dev\/preview\. Default: 4173/);
      assert.match(stdout, /comet-speedtest dev --port 5173/);
    });
  }

  test("unknown options point at --help", () => {
    const { status, stderr } = runCli(["dev", "--frobnicate"]);

    assert.equal(status, 1);
    assert.match(
      stderr,
      /Unknown option "--frobnicate"\. Run comet-speedtest --help\./,
    );
  });

  test("unknown commands point at --help", () => {
    const { status, stderr } = runCli(["deploy"]);

    assert.equal(status, 1);
    assert.match(stderr, /Unknown command "deploy"\. Run comet-speedtest --help\./);
  });
});
