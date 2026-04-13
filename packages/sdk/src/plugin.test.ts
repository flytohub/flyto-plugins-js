// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for FlytoPlugin JSON-RPC runtime.
 *
 * Verifies handshake, invoke, ping, shutdown, and error handling
 * by simulating stdin/stdout communication.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FlytoPlugin } from "./plugin.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

/**
 * Helper: directly call the private handleRequest method for testing
 * without needing actual stdin/stdout pipes.
 */
function getHandler(plugin: FlytoPlugin) {
  // Access private method via bracket notation for testing
  return (req: JsonRpcRequest) =>
    (plugin as unknown as { handleRequest(r: JsonRpcRequest): Promise<JsonRpcResponse | null> })
      .handleRequest(req);
}

describe("FlytoPlugin", () => {
  let plugin: FlytoPlugin;
  let handle: (req: JsonRpcRequest) => Promise<JsonRpcResponse | null>;

  beforeEach(() => {
    plugin = new FlytoPlugin({ id: "test-plugin", version: "1.0.0" });
    plugin.step("echo", async (input) => ({
      ok: true,
      data: { echo: input.message },
    }));
    plugin.step("fail", async () => {
      throw new Error("intentional failure");
    });
    handle = getHandler(plugin);
  });

  describe("handshake", () => {
    it("should respond with plugin version and registered steps", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "handshake",
        params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" },
        id: 1,
      });

      assert.ok(res);
      assert.equal(res.id, 1);
      const result = res.result as Record<string, unknown>;
      assert.equal(result.pluginVersion, "1.0.0");
      assert.deepEqual(result.steps, ["echo", "fail"]);
    });
  });

  describe("invoke", () => {
    it("should execute a registered step", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "echo", input: { message: "hello" } },
        id: 2,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: { echo: string } };
      assert.equal(result.ok, true);
      assert.equal(result.data.echo, "hello");
    });

    it("should return error for unknown step", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "nonexistent", input: {} },
        id: 3,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; error: { code: string } };
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "STEP_NOT_FOUND");
    });

    it("should catch handler exceptions and return error result", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "fail", input: {} },
        id: 4,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; error: { code: string; message: string } };
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "EXECUTION_ERROR");
      assert.match(result.error.message, /intentional failure/);
    });

    it("should pass context to handler", async () => {
      plugin.step("ctx_check", async (_input, ctx) => ({
        ok: true,
        data: {
          hasEndpoint: !!ctx.browserWsEndpoint,
          execId: ctx.executionId,
        },
      }));

      const res = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: {
          step: "ctx_check",
          input: {},
          context: {
            execution_id: "exec-123",
            browser_ws_endpoint: "ws://localhost:9222",
          },
        },
        id: 5,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: Record<string, unknown> };
      assert.equal(result.ok, true);
      assert.equal(result.data.hasEndpoint, true);
      assert.equal(result.data.execId, "exec-123");
    });
  });

  describe("ping", () => {
    it("should respond with ok status", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "ping",
        id: 10,
      });

      assert.ok(res);
      const result = res.result as { status: string };
      assert.equal(result.status, "ok");
    });
  });

  describe("unknown method", () => {
    it("should return method not found error", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "unknown_method",
        id: 20,
      });

      assert.ok(res);
      assert.ok(res.error);
      assert.equal(res.error.code, -32601);
    });
  });

  describe("notification (no id)", () => {
    it("should return null for notifications", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "ping",
      });

      assert.equal(res, null);
    });
  });

  describe("uiStep registration", () => {
    it("should include UI steps in handshake response", async () => {
      plugin.uiStep(
        "crop",
        { page: "ui", type: "dialog", width: 800, height: 600 },
        async (_input, ctx) => ({ ok: true, data: {} })
      );

      const res = await handle({
        jsonrpc: "2.0",
        method: "handshake",
        params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" },
        id: 100,
      });

      assert.ok(res);
      const result = res.result as {
        steps: string[];
        ui: Record<string, { type: string; width?: number; height?: number }>;
      };
      // Should include both headless and UI steps
      assert.ok(result.steps.includes("echo"));
      assert.ok(result.steps.includes("fail"));
      assert.ok(result.steps.includes("crop"));
      // Should report UI metadata
      assert.ok(result.ui);
      assert.equal(result.ui.crop.type, "dialog");
      assert.equal(result.ui.crop.width, 800);
      assert.equal(result.ui.crop.height, 600);
    });

    it("should return STEP_NOT_FOUND for unregistered UI step", async () => {
      const res = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "no_such_ui_step", input: {} },
        id: 101,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; error: { code: string } };
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "STEP_NOT_FOUND");
    });
  });
});
