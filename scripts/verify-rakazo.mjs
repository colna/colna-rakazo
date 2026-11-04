#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const web = process.env.RAKAZO_WEB_URL ?? "http://127.0.0.1:5173";
const api = process.env.RAKAZO_API_URL ?? "http://127.0.0.1:3100";
const argv = process.argv.slice(2);
const command = argv.shift() ?? "help";
const dryRun = argv.includes("--dry-run");
const args = argv.filter((arg) => arg !== "--dry-run");

function run(command, args) {
  const line = [command, ...args].join(" ");
  if (dryRun) {
    console.log(line);
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

async function doctor() {
  const checks = [];
  for (const [name, url] of [
    ["api", `${api}/internal/health`],
    ["web", web],
  ]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const text = await response.text();
      checks.push({
        name,
        url,
        status: response.status,
        ok: response.ok,
        body: text.slice(0, 500),
      });
    } catch (error) {
      checks.push({
        name,
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));
  return checks.every((check) => check.ok) ? 0 : 1;
}

async function main() {
  if (command === "help" || command === "-h" || command === "--help") {
    console.log(`Usage: node scripts/verify-rakazo.mjs <command> [args] [--dry-run]

Commands:
  doctor                         Check API health and web availability.
  screenshot [url] [path]         Capture a browser screenshot (default app URL).
  test [paths...]                 Run targeted Vitest files.
  e2e [specs...]                  Run web Playwright specs.
  check                           Run the full typecheck/lint gate.
  help                            Show this help.

Environment:
  RAKAZO_WEB_URL                  Default ${web}
  RAKAZO_API_URL                  Default ${api}`);
    return 0;
  }
  if (command === "doctor") return doctor();
  if (command === "screenshot") {
    const url = args[0] ?? web;
    const output = path.resolve(args[1] ?? "/tmp/rakazo-verify.png");
    if (dryRun) {
      console.log(`screenshot ${url} -> ${output}`);
      return 0;
    }
    try {
      const require = createRequire(import.meta.url);
      const { chromium } = require(path.resolve("apps/web/node_modules/@playwright/test"));
      const browser = await chromium.launch({
        channel: process.env.RAKAZO_PLAYWRIGHT_CHANNEL ?? "chrome",
        headless: true,
      });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: output, fullPage: true });
      await browser.close();
      console.log(`screenshot ${output}`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  if (command === "test") {
    if (!args.length) {
      console.error("Pass at least one test path, or use `check`.");
      return 1;
    }
    return run("pnpm", ["exec", "vitest", "run", ...args]);
  }
  if (command === "e2e") {
    return run("pnpm", ["--filter", "@rakazo/web", "e2e", ...args]);
  }
  if (command === "check") return run("pnpm", ["check"]);
  console.error(`Unknown command: ${command}`);
  return 1;
}

process.exitCode = await main();
