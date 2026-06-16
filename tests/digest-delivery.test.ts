import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { deliver } from "../src/digest/index.js";
import type { DigestDeliveryOpts } from "../src/digest/index.js";

const CONTENT = "# Digest\nSome content here.";

// ---------------------------------------------------------------------------
// stdout
// ---------------------------------------------------------------------------

describe("deliver: stdout", () => {
  it("returns delivered:true and channel stdout", () => {
    const result = deliver(CONTENT, {
      channel: "stdout",
      post: false,
      env: {},
    });
    expect(result.delivered).toBe(true);
    expect(result.channel).toBe("stdout");
  });

  it("message mentions stdout", () => {
    const result = deliver(CONTENT, { channel: "stdout", post: false, env: {} });
    expect(result.message).toMatch(/stdout/i);
  });
});

// ---------------------------------------------------------------------------
// file
// ---------------------------------------------------------------------------

describe("deliver: file", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-digest-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes content to the given outPath and returns delivered:true", () => {
    const outPath = path.join(tmpDir, "digest.md");
    const opts: DigestDeliveryOpts = {
      channel: "file",
      outPath,
      post: false,
      env: {},
    };
    const result = deliver(CONTENT, opts);
    expect(result.delivered).toBe(true);
    expect(result.channel).toBe("file");
    expect(fs.readFileSync(outPath, "utf8")).toBe(CONTENT);
  });

  it("result.destination equals outPath", () => {
    const outPath = path.join(tmpDir, "digest.md");
    const result = deliver(CONTENT, {
      channel: "file",
      outPath,
      post: false,
      env: {},
    });
    expect(result.destination).toBe(outPath);
  });

  it("creates nested directories if needed", () => {
    const outPath = path.join(tmpDir, "nested", "dir", "digest.md");
    deliver(CONTENT, { channel: "file", outPath, post: false, env: {} });
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("returns delivered:false when outPath is missing", () => {
    const result = deliver(CONTENT, {
      channel: "file",
      post: false,
      env: {},
    });
    expect(result.delivered).toBe(false);
    expect(result.message).toMatch(/output path/i);
  });
});

// ---------------------------------------------------------------------------
// webhook
// ---------------------------------------------------------------------------

describe("deliver: webhook", () => {
  it("returns delivered:false when post=false (no env)", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: false,
      env: {},
    });
    expect(result.delivered).toBe(false);
  });

  it("returns delivered:false when post=true but no env var", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: true,
      env: {},
    });
    expect(result.delivered).toBe(false);
  });

  it("returns delivered:false when post=false even if env var set", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: false,
      env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" },
    });
    expect(result.delivered).toBe(false);
  });

  it("message mentions --post and env var requirement when no --post", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: false,
      env: {},
    });
    expect(result.message).toMatch(/--post/);
    expect(result.message).toMatch(/COSTGUARD_DIGEST_WEBHOOK/);
  });

  it("post=true + env set: delivered:false, message contains 'would post'", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: true,
      env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" },
    });
    expect(result.delivered).toBe(false);
    expect(result.message).toMatch(/would post/i);
  });

  it("post=true + env set: destination is the host", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: true,
      env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" },
    });
    expect(result.destination).toBe("example.com");
  });

  it("post=true + env set: message mentions content byte length", () => {
    const result = deliver(CONTENT, {
      channel: "webhook",
      post: true,
      env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" },
    });
    expect(result.message).toContain(String(CONTENT.length));
  });

  it("webhook NEVER sets delivered:true under any condition", () => {
    const cases: DigestDeliveryOpts[] = [
      { channel: "webhook", post: false, env: {} },
      { channel: "webhook", post: true, env: {} },
      { channel: "webhook", post: false, env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" } },
      { channel: "webhook", post: true, env: { COSTGUARD_DIGEST_WEBHOOK: "https://example.com/hook" } },
    ];
    for (const opts of cases) {
      expect(deliver(CONTENT, opts).delivered).toBe(false);
    }
  });
});
