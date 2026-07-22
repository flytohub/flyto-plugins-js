// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Tests the real Slack plugin's offline registration and validation paths. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonRpcRequest, JsonRpcResponse, StepContext } from "@flyto2/plugin-sdk";
import { listChannels, plugin, sendMessage } from "./index.js";

/** Access private dispatch only to verify the registered runtime contract. */
function getHandler() {
  return (request: JsonRpcRequest) =>
    (plugin as unknown as {
      handleRequest(value: JsonRpcRequest): Promise<JsonRpcResponse | null>;
    }).handleRequest(request);
}

const context: StepContext = { raw: {} };

describe("Slack Plugin", () => {
  it("registers send_message and list_channels", async () => {
    const response = await getHandler()({
      jsonrpc: "2.0",
      method: "handshake",
      params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" },
      id: 1,
    });
    assert.deepEqual((response?.result as { steps: string[] }).steps, ["send_message", "list_channels"]);
  });

  it("validates message inputs before resolving credentials", async () => {
    const result = await sendMessage({ channel: "", message: "" }, context);
    assert.equal(result.error?.code, "INVALID_PARAMS");
    assert.equal((await sendMessage({ channel: 7, message: "hello" }, context)).error?.code, "INVALID_PARAMS");
    assert.equal((await sendMessage({ channel: "C1", message: "hello", thread_ts: 7 }, context)).error?.code, "INVALID_PARAMS");
  });

  it("enforces Slack's recommended one-page channel limit", async () => {
    assert.equal((await listChannels({ limit: 0 }, context)).error?.code, "INVALID_PARAMS");
    assert.equal((await listChannels({ limit: 201 }, context)).error?.code, "INVALID_PARAMS");
    assert.equal((await listChannels({ limit: 10.5 }, context)).error?.code, "INVALID_PARAMS");
    assert.equal((await listChannels({ limit: "10" }, context)).error?.code, "INVALID_PARAMS");
  });
});
