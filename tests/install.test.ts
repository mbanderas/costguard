import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// The installer is zero-dep CommonJS; load it through createRequire.
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const installer = require(path.join(here, "..", "scripts", "install.cjs")) as {
  run: (argv: string[]) => number;
  _test: {
    WRAPPER_MAP: Record<string, { src: string; proj: string }>;
    VALID_TARGETS: string[];
    parseArgs: (argv: string[]) => { target: string; dryRun: boolean; help: boolean };
    detectTarget: (root: string) => string;
  };
};

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-install-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("install.cjs --help / validation", () => {
  it("--help exits 0 without writing files", () => {
    expect(installer.run(["--help"])).toBe(0);
    expect(fs.readdirSync(tmp)).toHaveLength(0);
  });

  it("rejects an unknown target with exit 1", () => {
    expect(installer.run(["--target", "bogus", "--project", tmp])).toBe(1);
  });

  it("auto with no marker dir exits 1", () => {
    expect(installer.run(["--target", "auto", "--project", tmp])).toBe(1);
  });
});

describe("install.cjs cursor adapter", () => {
  const dest = (root: string) => path.join(root, ".cursor", "commands", "costguard.md");

  it("dry-run writes nothing", () => {
    expect(installer.run(["--target", "cursor", "--project", tmp, "--dry-run"])).toBe(0);
    expect(fs.existsSync(dest(tmp))).toBe(false);
  });

  it("installs the cursor command file", () => {
    expect(installer.run(["--target", "cursor", "--project", tmp])).toBe(0);
    expect(fs.existsSync(dest(tmp))).toBe(true);
    expect(fs.readFileSync(dest(tmp), "utf8")).toContain("Costguard");
  });

  it("is idempotent and no-clobber (preserves a user-edited file)", () => {
    fs.mkdirSync(path.dirname(dest(tmp)), { recursive: true });
    fs.writeFileSync(dest(tmp), "USER EDIT", "utf8");
    expect(installer.run(["--target", "cursor", "--project", tmp])).toBe(0);
    expect(fs.readFileSync(dest(tmp), "utf8")).toBe("USER EDIT");
  });
});

describe("install.cjs auto-detect", () => {
  it("detects cursor from a .cursor marker dir", () => {
    fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
    expect(installer._test.detectTarget(tmp)).toBe("cursor");
    expect(installer.run(["--target", "auto", "--project", tmp])).toBe(0);
    expect(fs.existsSync(path.join(tmp, ".cursor", "commands", "costguard.md"))).toBe(true);
  });
});

describe("install.cjs target coverage", () => {
  it("ships an adapter template for every wrapper target", () => {
    const root = path.join(here, "..");
    for (const [target, m] of Object.entries(installer._test.WRAPPER_MAP)) {
      expect(fs.existsSync(path.join(root, m.src)), `${target} template ${m.src}`).toBe(true);
    }
  });

  it("supports cursor, gemini, cline, windsurf, codex, claude, auto", () => {
    for (const t of ["auto", "claude", "codex", "cursor", "gemini", "cline", "windsurf"]) {
      expect(installer._test.VALID_TARGETS).toContain(t);
    }
  });
});
