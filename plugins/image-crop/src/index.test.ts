// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Tests the real Image Crop handler and registration contract. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonRpcRequest, JsonRpcResponse, UIStepContext } from "@flyto2/plugin-sdk";
import { cropImage, plugin } from "./index.js";

/** Access private dispatch only to verify the registered runtime contract. */
function getHandler() {
  return (request: JsonRpcRequest) =>
    (plugin as unknown as {
      handleRequest(value: JsonRpcRequest): Promise<JsonRpcResponse | null>;
    }).handleRequest(request);
}

/** Build a UI context around one deterministic crop response. */
function uiContext(
  result: { submitted: boolean; data: Record<string, unknown> },
): UIStepContext {
  return { raw: {}, waitForUI: async () => result };
}

describe("Image Crop Plugin", () => {
  it("registers crop_image with dialog metadata", async () => {
    const response = await getHandler()({
      jsonrpc: "2.0",
      method: "handshake",
      params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" },
      id: 1,
    });
    const result = response?.result as {
      steps: string[];
      ui: Record<string, { type: string; width: number; height: number }>;
    };
    assert.deepEqual(result.steps, ["crop_image"]);
    assert.deepEqual(result.ui.crop_image, { type: "dialog", width: 900, height: 650 });
  });

  it("rejects unsafe URLs and unsupported options before opening UI", async () => {
    const ctx = uiContext({ submitted: false, data: {} });
    assert.equal((await cropImage({ image_url: "file:///etc/passwd" }, ctx)).error?.code, "INVALID_PARAMS");
    assert.equal((await cropImage({ image_url: "https://img.test/a.png", aspect_ratio: "2:1" }, ctx)).error?.code, "INVALID_PARAMS");
    assert.equal((await cropImage({ image_url: "https://img.test/a.png", output_format: "image/gif" }, ctx)).error?.code, "INVALID_PARAMS");
    assert.equal((await cropImage({ image_url: "https://img.test/a.png", quality: 2 }, ctx)).error?.code, "INVALID_PARAMS");
    assert.equal((await cropImage({ image_url: 7 }, ctx)).error?.code, "INVALID_PARAMS");
  });

  it("normalizes valid and cancelled crop results", async () => {
    const valid = await cropImage(
      { image_url: "https://img.test/a.png" },
      uiContext({
        submitted: true,
        data: {
          croppedDataUrl: "data:image/png;base64,AA==",
          cropRect: { x: 0, y: 0, width: 10, height: 10 },
          originalSize: { width: 20, height: 20 },
        },
      }),
    );
    assert.equal(valid.ok, true);
    assert.equal(valid.data?.cropped_data_url, "data:image/png;base64,AA==");

    const cancelled = await cropImage(
      { image_url: "blob:https://flyto2.com/id" },
      uiContext({ submitted: false, data: {} }),
    );
    assert.equal(cancelled.error?.code, "USER_CANCELLED");
  });

  it("rejects malformed UI output", async () => {
    const result = await cropImage(
      { image_url: "data:image/png;base64,AA==" },
      uiContext({ submitted: true, data: { croppedDataUrl: "javascript:alert(1)" } }),
    );
    assert.equal(result.error?.code, "INVALID_UI_RESULT");

    const wrongMime = await cropImage(
      { image_url: "data:image/png;base64,AA==", output_format: "image/jpeg" },
      uiContext({
        submitted: true,
        data: {
          croppedDataUrl: "data:image/png;base64,AA==",
          cropRect: { x: 0, y: 0, width: 10, height: 10 },
          originalSize: { width: 20, height: 20 },
        },
      }),
    );
    assert.equal(wrongMime.error?.code, "INVALID_UI_RESULT");
  });
});
