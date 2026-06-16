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
});
