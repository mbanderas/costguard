import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { pathsIgnoreFixer } from "../src/fix/fixers/pathsIgnore.js";
import { concurrencyFixer } from "../src/fix/fixers/concurrency.js";
import { timeoutFixer } from "../src/fix/fixers/timeout.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

const baseContent = readFileSync(
  join(fixturesDir, "workflow-fix-base.yml"),
  "utf8",
);
const cleanContent = readFileSync(
  join(fixturesDir, "workflow-fix-clean.yml"),
  "utf8",
);
const deployContent = readFileSync(
  join(fixturesDir, "workflow-deploy-job.yml"),
  "utf8",
);

describe("pathsIgnoreFixer", () => {
  it("base: changed:true and patched contains paths-ignore entries", () => {
    const result = pathsIgnoreFixer("workflow.yml", baseContent);
    expect(result.changed).toBe(true);
    expect(result.patched).toContain("paths-ignore");
    expect(result.patched).toContain("**.md");
    expect(result.patched).toContain("docs/**");
  });

  it("base: original arg is untouched (not mutated)", () => {
    const original = baseContent;
    const result = pathsIgnoreFixer("workflow.yml", baseContent);
    expect(result.original).toBe(original);
    expect(baseContent).toBe(original);
  });

  it("clean: changed:false and patched === original (byte-identical)", () => {
    const result = pathsIgnoreFixer("workflow.yml", cleanContent);
    expect(result.changed).toBe(false);
    expect(result.patched).toBe(result.original);
    expect(result.patched).toBe(cleanContent);
  });

  it("comment preservation: top comment line survives patching base", () => {
    const result = pathsIgnoreFixer("workflow.yml", baseContent);
    expect(result.patched).toContain(
      "# base fixture: violates paths-ignore, concurrency, and timeout rules",
    );
  });

  it("idempotent: re-applying to own patched output -> changed:false", () => {
    const first = pathsIgnoreFixer("workflow.yml", baseContent);
    expect(first.changed).toBe(true);
    const second = pathsIgnoreFixer("workflow.yml", first.patched);
    expect(second.changed).toBe(false);
    expect(second.patched).toBe(second.original);
  });
});

describe("concurrencyFixer", () => {
  it("base: changed:true and patched contains concurrency block", () => {
    const result = concurrencyFixer("workflow.yml", baseContent);
    expect(result.changed).toBe(true);
    expect(result.patched).toContain("concurrency");
    expect(result.patched).toContain("cancel-in-progress: true");
  });

  it("clean: changed:false and patched === original (byte-identical)", () => {
    const result = concurrencyFixer("workflow.yml", cleanContent);
    expect(result.changed).toBe(false);
    expect(result.patched).toBe(result.original);
    expect(result.patched).toBe(cleanContent);
  });

  it("idempotent: re-applying to own patched output -> changed:false", () => {
    const first = concurrencyFixer("workflow.yml", baseContent);
    expect(first.changed).toBe(true);
    const second = concurrencyFixer("workflow.yml", first.patched);
    expect(second.changed).toBe(false);
    expect(second.patched).toBe(second.original);
  });
});

describe("timeoutFixer", () => {
  it("base: changed:true and patched contains timeout-minutes: 15 for both jobs", () => {
    const result = timeoutFixer("workflow.yml", baseContent);
    expect(result.changed).toBe(true);
    expect(result.patched).toContain("timeout-minutes: 15");
    const count = (result.patched.match(/timeout-minutes/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("clean: changed:false and patched === original (byte-identical)", () => {
    const result = timeoutFixer("workflow.yml", cleanContent);
    expect(result.changed).toBe(false);
    expect(result.patched).toBe(result.original);
    expect(result.patched).toBe(cleanContent);
  });

  it("idempotent: re-applying to own patched output -> changed:false", () => {
    const first = timeoutFixer("workflow.yml", baseContent);
    expect(first.changed).toBe(true);
    const second = timeoutFixer("workflow.yml", first.patched);
    expect(second.changed).toBe(false);
    expect(second.patched).toBe(second.original);
  });

  it("deploy job (helm step): timeout-minutes set to 60", () => {
    const result = timeoutFixer("workflow.yml", deployContent);
    expect(result.changed).toBe(true);
    expect(result.patched).toContain("timeout-minutes: 60");
  });

  it("base (pnpm-only steps): timeout-minutes still 15", () => {
    const result = timeoutFixer("workflow.yml", baseContent);
    expect(result.changed).toBe(true);
    expect(result.patched).toContain("timeout-minutes: 15");
    expect(result.patched).not.toContain("timeout-minutes: 60");
  });
});

describe("concurrencyFixer (cancel-in-progress:false no-op)", () => {
  it("workflow with cancel-in-progress:false -> changed:false (do not overwrite)", () => {
    const content = [
      "name: Deploy",
      "on:",
      "  push:",
      "    branches: [main]",
      "concurrency:",
      "  group: deploy",
      "  cancel-in-progress: false",
      "jobs:",
      "  release:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo hi",
    ].join("\n");
    const result = concurrencyFixer("workflow.yml", content);
    expect(result.changed).toBe(false);
  });
});

describe("pathsIgnoreFixer (skip guards)", () => {
  it("push trigger with paths allow-list -> changed:false", () => {
    const content = [
      "name: CI",
      "on:",
      "  push:",
      "    paths:",
      "      - 'src/**'",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 5",
      "    steps:",
      "      - run: echo hi",
    ].join("\n");
    const result = pathsIgnoreFixer("workflow.yml", content);
    expect(result.changed).toBe(false);
  });

  it("tag-only push (no branches key) -> changed:false", () => {
    const content = [
      "name: Release",
      "on:",
      "  push:",
      "    tags:",
      "      - 'v*'",
      "jobs:",
      "  release:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 5",
      "    steps:",
      "      - run: echo hi",
    ].join("\n");
    const result = pathsIgnoreFixer("workflow.yml", content);
    expect(result.changed).toBe(false);
  });
});
