import type { HttpFetcher, HttpResponse } from "./types.js";

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
