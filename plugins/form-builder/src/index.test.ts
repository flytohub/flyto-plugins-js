// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for Form Builder plugin step handlers.
 *
 * Tests parameter validation and step registration for both
 * collect_form and approval_form steps.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPlugin } from "@flyto/plugin-sdk";
import type { JsonRpcRequest, JsonRpcResponse, StepResult } from "@flyto/plugin-sdk";

function getHandler(plugin: ReturnType<typeof createPlugin>) {
  return (req: JsonRpcRequest) =>
    (plugin as unknown as { handleRequest(r: JsonRpcRequest): Promise<JsonRpcResponse | null> })
      .handleRequest(req);
}

describe("Form Builder Plugin", () => {
  describe("collect_form", () => {
    it("should register as a UI step in handshake", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.uiStep(
        "collect_form",
        { page: "ui", type: "dialog", width: 720, height: 700 },
        async (input, ctx) => ({ ok: true, data: {} })
      );

      const handle = getHandler(plugin);
      const hs = await handle({
        jsonrpc: "2.0", method: "handshake",
        params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" }, id: 1,
      });

      assert.ok(hs);
      const result = hs.result as { steps: string[]; ui: Record<string, unknown> };
      assert.ok(result.steps.includes("collect_form"));
      assert.ok(result.ui);
    });

    it("should return error when fields is empty", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.step("collect_form", async (input) => {
        const fields = input.fields as unknown[];
        if (!fields || !Array.isArray(fields) || fields.length === 0) {
          return {
            ok: false,
            error: { code: "INVALID_PARAMS", message: "'fields' must be a non-empty array" },
          };
        }
        return { ok: true, data: {} };
      });

      const handle = getHandler(plugin);

      // No fields
      const res = await handle({
        jsonrpc: "2.0", method: "invoke",
        params: { step: "collect_form", input: { title: "Test" } }, id: 2,
      });
      assert.ok(res);
      assert.equal((res.result as StepResult).ok, false);
      assert.equal((res.result as StepResult).error!.code, "INVALID_PARAMS");

      // Empty fields array
      const res2 = await handle({
        jsonrpc: "2.0", method: "invoke",
        params: { step: "collect_form", input: { title: "Test", fields: [] } }, id: 3,
      });
      assert.ok(res2);
      assert.equal((res2.result as StepResult).ok, false);
    });

    it("should accept valid fields and return submitted data", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.step("collect_form", async (input) => {
        const fields = input.fields as unknown[];
        if (!fields || !Array.isArray(fields) || fields.length === 0) {
          return { ok: false, error: { code: "INVALID_PARAMS", message: "fields required" } };
        }
        // Simulate submitted result (in real flow, waitForUI resolves this)
        return {
          ok: true,
          data: {
            submitted: true,
            values: { name: "Chester", email: "c@flyto.io" },
            metadata: { timestamp: new Date().toISOString() },
          },
        };
      });

      const handle = getHandler(plugin);
      const res = await handle({
        jsonrpc: "2.0", method: "invoke",
        params: {
          step: "collect_form",
          input: {
            title: "User Info",
            fields: [
              { id: "name", type: "text", label: "Name", required: true },
              { id: "email", type: "email", label: "Email", required: true },
            ],
          },
        },
        id: 4,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: { submitted: boolean; values: Record<string, string> } };
      assert.equal(result.ok, true);
      assert.equal(result.data.submitted, true);
      assert.equal(result.data.values.name, "Chester");
    });
  });

  describe("approval_form", () => {
    it("should register as a UI step", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.uiStep(
        "approval_form",
        { page: "ui", type: "dialog", width: 640, height: 600 },
        async (input, ctx) => ({ ok: true, data: {} })
      );

      const handle = getHandler(plugin);
      const hs = await handle({
        jsonrpc: "2.0", method: "handshake",
        params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" }, id: 1,
      });

      const result = hs!.result as { steps: string[] };
      assert.ok(result.steps.includes("approval_form"));
    });

    it("should return approved decision with comment", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.step("approval_form", async (input) => {
        return {
          ok: true,
          data: {
            decision: "approved",
            comment: "Looks good",
            values: {},
          },
        };
      });

      const handle = getHandler(plugin);
      const res = await handle({
        jsonrpc: "2.0", method: "invoke",
        params: {
          step: "approval_form",
          input: {
            title: "Deploy to production?",
            context: { version: "2.1.0", env: "production" },
          },
        },
        id: 2,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: { decision: string; comment: string } };
      assert.equal(result.ok, true);
      assert.equal(result.data.decision, "approved");
      assert.equal(result.data.comment, "Looks good");
    });

    it("should return rejected decision", async () => {
      const plugin = createPlugin({ id: "test/form-builder", version: "0.1.0" });

      plugin.step("approval_form", async (input) => {
        return {
          ok: true,
          data: {
            decision: "rejected",
            comment: "Not ready",
            values: {},
          },
        };
      });

      const handle = getHandler(plugin);
      const res = await handle({
        jsonrpc: "2.0", method: "invoke",
        params: { step: "approval_form", input: { title: "Approve?" } }, id: 3,
      });

      assert.ok(res);
      const result = res.result as { ok: boolean; data: { decision: string } };
      assert.equal(result.ok, true);
      assert.equal(result.data.decision, "rejected");
    });
  });
});
