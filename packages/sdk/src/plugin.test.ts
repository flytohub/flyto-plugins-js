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
    plugin = new FlytoPlugin({ id: "test/plugin", version: "1.0.0" });
    plugin.step("echo", async (input) => ({
      ok: true,
      data: { echo: input.message },
    }));
    plugin.step("fail", async () => {
      throw new Error("intentional failure");
    });
    handle = getHandler(plugin);
  });

  describe("registration validation", () => {
    it("should reject malformed plugin and step identifiers", () => {
      assert.throws(() => new FlytoPlugin({ id: "missing-slash", version: "1.0.0" }), /vendor\/name/);
      assert.throws(() => new FlytoPlugin({ id: "test/plugin", version: "latest" }), /semantic version/);
      assert.throws(() => plugin.step("../unsafe", async () => ({ ok: true })), /Step id/);
      assert.throws(
        () => plugin.step("not_callable", null as unknown as () => Promise<{ ok: true }>),
        /must be a function/,
      );
    });

    it("should reject duplicate step registrations across handler types", () => {
      assert.throws(() => plugin.step("echo", async () => ({ ok: true })), /already registered/);
      assert.throws(
        () => plugin.uiStep("echo", { page: "ui" }, async () => ({ ok: true })),
        /already registered/,
      );
    });

    it("should reject unsafe UI roots and timeouts", () => {
      assert.throws(
        () => plugin.uiStep("unsafe", { page: "../outside" }, async () => ({ ok: true })),
        /plugin root/,
      );
      assert.throws(
        () => plugin.uiStep("timeout", { page: "ui", timeoutMs: 0 }, async () => ({ ok: true })),
        /positive finite/,
      );
      assert.throws(
        () => plugin.uiStep("windows", { page: "..\\outside" }, async () => ({ ok: true })),
        /plugin root/,
      );
      assert.throws(
        () => plugin.uiStep(
          "mode",
          { page: "ui", type: "popup" as "dialog" },
          async () => ({ ok: true }),
        ),
        /page, panel, or dialog/,
      );
      assert.throws(
        () => plugin.uiStep("size", { page: "ui", width: 20_000 }, async () => ({ ok: true })),
        /no greater than 10000/,
      );
    });
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
    it("should return JSON-RPC invalid params for a missing step id", async () => {
      const res = await handle({ jsonrpc: "2.0", method: "invoke", params: {}, id: 1 });
      assert.equal(res?.error?.code, -32602);
      const badInput = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "echo", input: [] as unknown as Record<string, unknown> },
        id: 2,
      });
      assert.equal(badInput?.error?.code, -32602);
      const badContext = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "echo", context: "bad" as unknown as Record<string, unknown> },
        id: 3,
      });
      assert.equal(badContext?.error?.code, -32602);
    });

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

      plugin.step("invalid_result", async () => null as unknown as { ok: true });
      const invalid = await handle({
        jsonrpc: "2.0",
        method: "invoke",
        params: { step: "invalid_result", input: {} },
        id: 40,
      });
      const invalidResult = invalid?.result as { ok: boolean; error: { message: string } };
      assert.equal(invalidResult.ok, false);
      assert.match(invalidResult.error.message, /boolean 'ok'/);
    });

    it("should pass context to handler", async () => {
      plugin.step("ctx_check", async (_input, ctx) => ({
        ok: true,
        data: {
          hasEndpoint: !!ctx.browserWsEndpoint,
          execId: ctx.executionId,
          token: ctx.secrets?.TOKEN,
          numericSecret: ctx.secrets?.NUMERIC,
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
            secrets: { TOKEN: "secret", NUMERIC: 123 },
          },
        },
        id: 5,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: Record<string, unknown> };
      assert.equal(result.ok, true);
      assert.equal(result.data.hasEndpoint, true);
      assert.equal(result.data.execId, "exec-123");
      assert.equal(result.data.token, "secret");
      assert.equal(result.data.numericSecret, undefined);
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

  describe("request validation", () => {
    it("should reject an invalid JSON-RPC envelope with an id", async () => {
      const res = await handle(
        { jsonrpc: "1.0", method: "ping", id: 21 } as unknown as JsonRpcRequest,
      );
      assert.equal(res?.error?.code, -32600);
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
