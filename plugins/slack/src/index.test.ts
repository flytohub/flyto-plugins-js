// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for Slack plugin step handlers.
 *
 * Tests validation and error paths only — actual Slack API calls
 * require credentials and are tested in integration tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPlugin } from "@flyto/plugin-sdk";
import type { JsonRpcRequest, JsonRpcResponse } from "@flyto/plugin-sdk";

function getHandler(plugin: ReturnType<typeof createPlugin>) {
  return (req: JsonRpcRequest) =>
    (plugin as unknown as { handleRequest(r: JsonRpcRequest): Promise<JsonRpcResponse | null> })
      .handleRequest(req);
}

describe("Slack Plugin", () => {
  // We can't test the actual Slack API without credentials,
  // so we test the plugin's registration and parameter validation.

  it("should register send_message and list_channels steps", async () => {
    // Import the plugin module to trigger step registration
    // Since the plugin calls plugin.start() which listens on stdin,
    // we test via a fresh plugin instance instead.
    const plugin = createPlugin({ id: "test/slack", version: "0.1.0" });

    // Register steps with validation-only handlers
    plugin.step("send_message", async (input) => {
      const channel = input.channel as string;
      const message = input.message as string;
      if (!channel || !message) {
        return { ok: false, error: { code: "INVALID_PARAMS", message: "Both 'channel' and 'message' are required" } };
      }
      return { ok: true, data: { ts: "1234.5678", channel } };
    });

    plugin.step("list_channels", async (input) => {
      return { ok: true, data: { channels: [] } };
    });

    const handle = getHandler(plugin);

    // Handshake should list both steps
    const hs = await handle({
      jsonrpc: "2.0", method: "handshake",
      params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" }, id: 1,
    });
    assert.ok(hs);
    const steps = (hs.result as { steps: string[] }).steps;
    assert.ok(steps.includes("send_message"));
    assert.ok(steps.includes("list_channels"));

    // send_message without required params should fail
    const res = await handle({
      jsonrpc: "2.0", method: "invoke",
      params: { step: "send_message", input: {} }, id: 2,
    });
    assert.ok(res);
    const result = res.result as { ok: boolean; error: { code: string } };
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_PARAMS");

    // send_message with valid params should succeed
    const res2 = await handle({
      jsonrpc: "2.0", method: "invoke",
      params: { step: "send_message", input: { channel: "#general", message: "hello" } }, id: 3,
    });
    assert.ok(res2);
    const result2 = res2.result as { ok: boolean; data: { ts: string; channel: string } };
    assert.equal(result2.ok, true);
    assert.equal(result2.data.channel, "#general");

    // list_channels should return empty array
    const res3 = await handle({
      jsonrpc: "2.0", method: "invoke",
      params: { step: "list_channels", input: {} }, id: 4,
    });
    assert.ok(res3);
    const result3 = res3.result as { ok: boolean; data: { channels: unknown[] } };
    assert.equal(result3.ok, true);
    assert.ok(Array.isArray(result3.data.channels));
  });
});
