// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Tests the real Form Builder handlers and registration contract. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { JsonRpcRequest, JsonRpcResponse, UIStepContext } from "@flyto2/plugin-sdk";
import { approvalForm, collectForm, plugin } from "./index.js";

const uiSource = fs.readFileSync(
  path.resolve("ui/index.html"),
  "utf8",
);

/** Access private dispatch only to verify the registered runtime contract. */
function getHandler() {
  return (request: JsonRpcRequest) =>
    (plugin as unknown as {
      handleRequest(value: JsonRpcRequest): Promise<JsonRpcResponse | null>;
    }).handleRequest(request);
}

/** Build a UI context around one deterministic test response. */
function uiContext(
  result: { submitted: boolean; data: Record<string, unknown> },
): UIStepContext {
  return {
    raw: {},
    waitForUI: async () => result,
  };
}

describe("Form Builder Plugin", () => {
  it("renders through an inert allowlisted DOM boundary", () => {
    assert.ok(!uiSource.includes("app.innerHTML ="));
    assert.ok(uiSource.includes("new DOMParser().parseFromString(html, 'text/html')"));
    assert.ok(uiSource.includes("app.replaceChildren(sanitizeRenderedHtml(rendered))"));
    for (const executableTag of ["'SCRIPT'", "'SVG'", "'MATH'", "'IFRAME'", "'OBJECT'", "'EMBED'"]) {
      assert.ok(uiSource.includes(executableTag), `missing blocked subtree ${executableTag}`);
    }
    assert.ok(uiSource.includes("name.startsWith('on')"), "event attributes must be rejected");
    for (const urlAttribute of ["href", "src", "action", "formaction", "xlink:href"]) {
      assert.ok(!uiSource.match(new RegExp(`allowedAttributes[\\s\\S]{0,900}'${urlAttribute}'`)));
    }
  });

  it("keeps hostile text as escaped form content", () => {
    for (const payload of [
      "<img src=x onerror=alert(1)>",
      "<a href=javascript:alert(1)>x</a>",
      "<a href=data:text/html,pwned>x</a>",
      "<svg><a xlink:href=javascript:alert(1)>x</a></svg>",
      "<math><mtext><img src=x onerror=alert(1)></mtext></math>",
      "'\"\\|\r\n`[]",
    ]) {
      const escaped = payload
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      assert.ok(!escaped.includes("<svg"));
      assert.ok(!escaped.includes("<math"));
      assert.ok(!escaped.includes("<img"));
      assert.ok(!escaped.includes("<a "));
    }
  });

  it("registers both manifest step IDs", async () => {
    const response = await getHandler()({
      jsonrpc: "2.0",
      method: "handshake",
      params: { protocolVersion: "0.1.0", pluginId: "test", executionId: "e1" },
      id: 1,
    });
    const result = response?.result as { steps: string[] };
    assert.deepEqual(result.steps, ["collect_form", "approval_form"]);
  });

  describe("collectForm", () => {
    it("rejects missing title, fields, and unsupported mode", async () => {
      const ctx = uiContext({ submitted: false, data: {} });
      assert.equal((await collectForm({}, ctx)).error?.code, "INVALID_PARAMS");
      assert.equal(
        (await collectForm({ title: "Survey", fields: [{}], mode: "pages" }, ctx)).error?.code,
        "INVALID_PARAMS",
      );
      assert.equal(
        (await collectForm({ title: 7, fields: [{ id: "name", type: "text" }] }, ctx)).error?.code,
        "INVALID_PARAMS",
      );
      assert.equal(
        (await collectForm({ title: "Survey", fields: [
          { id: "name", type: "text" }, { id: "name", type: "text" },
        ] }, ctx)).error?.code,
        "INVALID_PARAMS",
      );
      assert.equal(
        (await collectForm({ title: "Survey", fields: [{ id: "choice", type: "select" }] }, ctx)).error?.code,
        "INVALID_PARAMS",
      );
    });

    it("normalizes submitted values and metadata", async () => {
      const result = await collectForm(
        { title: "Survey", fields: [{ id: "name", type: "text" }] },
        uiContext({ submitted: true, data: { values: { name: "Ada" }, metadata: { duration_ms: 4 } } }),
      );
      assert.deepEqual(result.data, {
        submitted: true,
        values: { name: "Ada" },
        metadata: { duration_ms: 4 },
      });
    });

    it("returns an explicit successful cancellation", async () => {
      const result = await collectForm(
        { title: "Survey", fields: [{ id: "name", type: "text" }] },
        uiContext({ submitted: false, data: {} }),
      );
      assert.deepEqual(result.data, { submitted: false, values: {}, metadata: { cancelled: true } });
    });
  });

  describe("approvalForm", () => {
    it("requires a title and a valid decision", async () => {
      assert.equal(
        (await approvalForm({}, uiContext({ submitted: false, data: {} }))).error?.code,
        "INVALID_PARAMS",
      );
      assert.equal(
        (await approvalForm(
          { title: "Deploy?" },
          uiContext({ submitted: true, data: { decision: "maybe" } }),
        )).error?.code,
        "INVALID_UI_RESULT",
      );
      assert.equal(
        (await approvalForm(
          { title: "Deploy?", context: [] },
          uiContext({ submitted: false, data: {} }),
        )).error?.code,
        "INVALID_PARAMS",
      );
    });

    it("enforces required reviewer comments", async () => {
      const result = await approvalForm(
        { title: "Deploy?", require_comment: true },
        uiContext({ submitted: true, data: { decision: "approved", comment: "" } }),
      );
      assert.equal(result.error?.code, "INVALID_UI_RESULT");
    });

    it("returns approved and closed-dialog decisions", async () => {
      const approved = await approvalForm(
        { title: "Deploy?", require_comment: true },
        uiContext({ submitted: true, data: { decision: "approved", comment: "Reviewed" } }),
      );
      assert.deepEqual(approved.data, { decision: "approved", comment: "Reviewed", values: {} });

      const closed = await approvalForm(
        { title: "Deploy?" },
        uiContext({ submitted: false, data: {} }),
      );
      assert.equal(closed.data?.decision, "rejected");
    });
  });
});
