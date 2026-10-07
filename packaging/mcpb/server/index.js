#!/usr/bin/env node
import { spawn } from "node:child_process";

const PACKAGE_URL =
  "https://github.com/jabbertones-cloud/wwdc-mcp-server/releases/download/v0.2.0/wwdc-mcp-server-0.2.0.tgz";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = [
  "exec",
  "--yes",
  `--package=${PACKAGE_URL}`,
  "--",
  "wwdc-mcp-server",
];

const child = spawn(npmCommand, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
  },
  windowsHide: true,
});

const forward = (signal) => {
  if (!child.killed) {
    try {
      child.kill(signal);
    } catch {
      // The child may already have exited.
    }
  }
};

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("error", (error) => {
  console.error(
    "[wwdc-mcp] failed to launch the pinned v0.2.0 package through npm:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
