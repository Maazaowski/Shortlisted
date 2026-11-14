import { defineConfig } from "@playwright/test";
import { STACKS } from "./stack.js";

/**
 * Three projects, run one after another on one worker, because the app has
 * one user and the tests build on each other's state:
 *
 *   manual     the whole product in paste mode, from an empty install
 *   cli        the automatic path through the stand-in command line tool
 *   extension  the Chrome extension, against the manual stack
 *
 * Inside a project the files run in name order.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "manual", testDir: "./tests/manual", use: { baseURL: STACKS.manual.url } },
    { name: "cli", testDir: "./tests/cli", use: { baseURL: STACKS.cli.url } },
    { name: "extension", testDir: "./tests/extension", dependencies: ["manual"], use: { baseURL: STACKS.manual.url } },
    // Not a test: records the captioned product tour. Only with E2E_WALKTHROUGH=1, see walkthrough/tour.spec.ts.
    ...(process.env.E2E_WALKTHROUGH === "1" ? [{ name: "walkthrough", testDir: "./walkthrough", use: { baseURL: STACKS.cli.url, trace: "off" as const, screenshot: "off" as const, channel: "chromium", actionTimeout: 20_000 } }] : []),
  ],
});
