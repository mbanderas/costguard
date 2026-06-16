import { describe, expect, it } from "vitest";
import {
  GRAPHQL_MUTATION_GUARD,
  makeFixtureGraphqlClient,
  makeLiveGraphqlClient,
} from "../../src/providers/fetcher.js";

describe("GRAPHQL_MUTATION_GUARD regex", () => {
  it("does not match a query document", () => {
    expect(GRAPHQL_MUTATION_GUARD.test("query Q { x }")).toBe(false);
  });

  it("matches a mutation document", () => {
    expect(GRAPHQL_MUTATION_GUARD.test("mutation M { y }")).toBe(true);
  });
});

describe("makeFixtureGraphqlClient", () => {
  it("resolves to the fixture payload for a matching query", async () => {
    const client = makeFixtureGraphqlClient({ Foo: { ok: true } });
    const result = await client.query("query Foo { x }");
    expect(result).toEqual({ ok: true });
  });

  it("rejects a mutation document with /forbidden/", async () => {
    const client = makeFixtureGraphqlClient({});
    await expect(
      client.query("mutation Nuke { deleteEverything }"),
    ).rejects.toThrow(/forbidden/);
  });

  it("rejects when no fixture exists for the operation name", async () => {
    const client = makeFixtureGraphqlClient({});
    await expect(client.query("query Bar { z }")).rejects.toThrow(
      /no fixture for query "Bar"/,
    );
  });
});

describe("makeLiveGraphqlClient — guard runs before fetch", () => {
  it("rejects a mutation document with /forbidden/ without making a network call", async () => {
    // No fetch stub needed: the guard throws synchronously before any await.
    const client = makeLiveGraphqlClient("tok", "http://example.invalid");
    await expect(client.query("mutation X { y }")).rejects.toThrow(/forbidden/);
  });
});
