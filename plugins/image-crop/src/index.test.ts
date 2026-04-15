// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for Image Crop plugin step handlers.
 *
 * Tests parameter validation and UI step registration.
 * Actual UI interaction is tested via E2E tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPlugin } from "@flyto2/plugin-sdk";
import type { JsonRpcRequest, JsonRpcResponse } from "@flyto2/plugin-sdk";

function getHandler(plugin: ReturnType<typeof createPlugin>) {
  return (req: JsonRpcRequest) =>
    (plugin as unknown as { handleRequest(r: JsonRpcRequest): Promise<JsonRpcResponse | null> })
      .handleRequest(req);
}

describe("Image Crop Plugin", () => {
  it("should register crop_image as a UI step in handshake", async () => {
    const plugin = createPlugin({ id: "test/image-crop", version: "0.1.0" });

    plugin.uiStep(
      "crop_image",
      { page: "ui", type: "dialog", width: 900, height: 650 },
      async (input, ctx) => {
        if (!input.image_url) {
          return { ok: false, error: { code: "INVALID_PARAMS", message: "'image_url' is required" } };
        }
        return { ok: true, data: {} };
      }
    );

    const handle = getHandler(plugin);

    const hs = await handle({
      jsonrpc: "2.0", method: "handshake",
      params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" }, id: 1,
    });

    assert.ok(hs);
    const result = hs.result as { steps: string[]; ui: Record<string, { type: string; width: number; height: number }> };
    assert.ok(result.steps.includes("crop_image"));
    assert.ok(result.ui);
    assert.equal(result.ui.crop_image.type, "dialog");
    assert.equal(result.ui.crop_image.width, 900);
    assert.equal(result.ui.crop_image.height, 650);
  });

  it("should return error when image_url is missing", async () => {
    const plugin = createPlugin({ id: "test/image-crop", version: "0.1.0" });

    // Register without UI (we can't test waitForUI in unit tests)
    plugin.step("crop_image", async (input) => {
      if (!input.image_url) {
        return { ok: false, error: { code: "INVALID_PARAMS", message: "'image_url' is required" } };
      }
      return { ok: true, data: {} };
    });

    const handle = getHandler(plugin);
    const res = await handle({
      jsonrpc: "2.0", method: "invoke",
      params: { step: "crop_image", input: {} }, id: 2,
    });

    assert.ok(res);
    const result = res.result as { ok: boolean; error: { code: string } };
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_PARAMS");
  });
});
