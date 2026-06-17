import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";
import { tools } from "../../src/mcp/tools/index.js";

async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer();
  const client = new Client({ name: "costguard-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("mcp server bootstrap", () => {
  it("builds and connects over an in-memory transport", async () => {
    const { close } = await connectedClient();
    // Reaching here means the McpServer booted, registered the registry tools
    // without throwing, and completed the initialize handshake.
    await close();
  });

  it("lists exactly the registry tools (capability appears once a tool is registered)", async () => {
    const { client, close } = await connectedClient();
    try {
      const expectedNames = [...tools].map((t) => t.name).sort();
      if (expectedNames.length > 0) {
        const listed = await client.listTools();
        expect(listed.tools.map((t) => t.name).sort()).toEqual(expectedNames);
      } else {
        // The SDK only wires the tools/list handler after the first registerTool;
        // with an empty registry the request is unsupported (server replies
        // -32601 Method not found). P1 transient state — P2+ populate the shared
        // registry, at which point the branch above runs instead.
        await expect(client.listTools()).rejects.toThrow(/Method not found|does not support tools/i);
      }
    } finally {
      await close();
    }
  });
});
