import type { GraphqlClient, HttpFetcher, HttpResponse } from "./types.js";

// ------------------------------------------------------------------
// Mutation guard — shared by both GraphQL client factories.
// ------------------------------------------------------------------

export const GRAPHQL_MUTATION_GUARD = /\bmutation\b/i;

// ------------------------------------------------------------------
// GraphQL client — READ-ONLY by design.
//
// Why POST? The GraphQL spec requires POST for query operations when
// a request body is present (variables, operation name). This is the
// SOLE use of `method: "POST"` and `body:` in src/. It is read-only
// because the GRAPHQL_MUTATION_GUARD rejects any document containing
// the word "mutation" before a network call is ever made.
// ------------------------------------------------------------------

export function makeLiveGraphqlClient(
  token: string,
  endpoint: string,
): GraphqlClient {
  return {
    async query<T = unknown>(
      document: string,
      variables?: Record<string, unknown>,
    ): Promise<T> {
      if (GRAPHQL_MUTATION_GUARD.test(document)) {
        throw new Error("GraphQL mutation forbidden (costguard read-only guard)");
      }
      const body: Record<string, unknown> = { query: document };
      if (variables !== undefined) body["variables"] = variables;
      const response = await globalThis.fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`GraphQL HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        data?: unknown;
        errors?: unknown[];
      };
      if (json.errors !== undefined && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
      }
      if (json.data === undefined) {
        throw new Error("GraphQL response missing data field");
      }
      return json.data as T;
    },
  };
}

export function makeFixtureGraphqlClient(
  map: Record<string, unknown>,
): GraphqlClient {
  return {
    async query<T = unknown>(document: string): Promise<T> {
      if (GRAPHQL_MUTATION_GUARD.test(document)) {
        throw new Error("GraphQL mutation forbidden (costguard read-only guard)");
      }
      const match = /query\s+(\w+)/.exec(document);
      const key = match?.[1] ?? "__default";
      if (map[key] === undefined) {
        throw new Error(`no fixture for query "${key}"`);
      }
      return map[key] as T;
    },
  };
}

// ------------------------------------------------------------------
// Live fetcher — the ONLY place tokens reach the network.
// Never logs or prints the token.
// GET only (no method/body override — fetch default).
// ------------------------------------------------------------------

export function makeLiveFetcher(token: string): HttpFetcher {
  return async (url, opts): Promise<HttpResponse> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    };
    const response = await globalThis.fetch(url, { headers });
    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json() as Promise<unknown>,
    };
  };
}

// ------------------------------------------------------------------
// Fixture fetcher — for tests and offline usage.
// Matches the LONGEST (most specific) key that is a substring of the
// requested URL, so prefix keys (e.g. "/v1/projects") never shadow a
// more specific one (e.g. "/v1/projects/ref/branches"). No network.
// ------------------------------------------------------------------

export function makeFixtureFetcher(map: Record<string, unknown>): HttpFetcher {
  return async (url): Promise<HttpResponse> => {
    const matchKey = Object.keys(map)
      .filter((key) => url.includes(key))
      .sort((a, b) => b.length - a.length)[0];
    if (matchKey === undefined) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }
    const value = map[matchKey];
    return {
      ok: true,
      status: 200,
      json: async () => value,
    };
  };
}
