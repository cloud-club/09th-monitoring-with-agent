import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";

import { ROOT_DIR } from "./config.mjs";

const execFileAsync = promisify(execFile);

export function ensureK6Available() {
  const result = spawnSync("k6", ["version"], { stdio: "ignore" });
  if (result.error) {
    throw new Error("k6 CLI is not installed or not on PATH.");
  }
}

export async function execText(file, args, options = {}) {
  const result = await execFileAsync(file, args, {
    cwd: ROOT_DIR,
    timeout: options.timeout ?? 60_000,
    env: { ...process.env, ...(options.env || {}) },
  });
  return result.stdout.trim();
}

export function spawnTracked(command, args, options = {}) {
  return spawn(command, args, {
    cwd: ROOT_DIR,
    stdio: options.stdio || "ignore",
    env: { ...process.env, ...(options.env || {}) },
  });
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
