// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/** Tests the real Form Builder handlers and registration contract. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
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
  it("constructs the form DOM without dynamic HTML parsing sinks", () => {
    for (const sink of ["DOMParser", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
      assert.ok(!uiSource.includes(sink), `dynamic HTML sink remains: ${sink}`);
    }
    assert.ok(uiSource.includes("document.createElement(tag)"));
    assert.ok(uiSource.includes("node.textContent = String(text)"));
    assert.ok(uiSource.includes("app.replaceChildren(stepType === 'approval_form'"));
    assert.ok(!uiSource.includes("querySelector('[data-slider-display=\"' + fid"));
    assert.ok(!uiSource.includes("querySelector('[data-color-display=\"' + fid"));
    assert.ok(uiSource.includes("candidate.dataset.sliderDisplay === fid"));
    assert.ok(uiSource.includes("candidate.dataset.colorDisplay === fid"));
  });

  it("keeps hostile labels, values, placeholders, options, help, errors, and context as text", () => {
    class FakeNode {
      children: FakeNode[] = [];
      dataset: Record<string, string> = {};
      style: Record<string, string> = {};
      className = "";
      text = "";
      value = "";
      placeholder = "";
      type = "";
      constructor(readonly tagName: string) {}
      appendChild(child: FakeNode) { this.children.push(child); return child; }
      set textContent(value: string) { this.text = String(value); this.children = []; }
      get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
    }
    const document = {
      createElement: (tag: string) => new FakeNode(tag.toUpperCase()),
      createDocumentFragment: () => new FakeNode("#FRAGMENT"),
      createTextNode: (text: string) => { const node = new FakeNode("#TEXT"); node.textContent = text; return node; },
    };
    const start = uiSource.indexOf("    function element(");
    const end = uiSource.indexOf("    // ── Event Binding", start);
    assert.ok(start > 0 && end > start, "renderer functions must be extractable");

    const payloads = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<svg onload=alert(1)><a xlink:href=javascript:alert(1)>x</a></svg>",
      "\"><input autofocus onfocus=alert(1)>",
    ];
    const context = vm.createContext({ document, String, JSON });
    const rendererSource = uiSource.slice(start, end) + `
      globalThis.testRender = { renderFields, renderFieldInput, renderSelect, renderApprovalForm };
    `;
    vm.runInContext(`
      const values = { text: ${JSON.stringify(payloads[1])} };
      const errors = { text: ${JSON.stringify(payloads[3])}, __comment: ${JSON.stringify(payloads[0])} };
      const props = {
        title: ${JSON.stringify(payloads[0])}, requireComment: true,
        context: { [${JSON.stringify(payloads[2])}]: ${JSON.stringify(payloads[1])} }, fields: []
      };
      const getVisibleFields = fields => fields;
      ${rendererSource}
    `, context);
    const renderers = (context as { testRender: Record<string, (...args: unknown[]) => FakeNode> }).testRender;
    const fields = [{
      id: "text", type: "text", label: payloads[0], placeholder: payloads[1],
      hint: payloads[2], options: [{ value: payloads[3], label: payloads[2] }],
    }];
    const roots = [
      renderers.renderFields(fields),
      renderers.renderSelect({ ...fields[0], type: "select" }, payloads[3]),
      renderers.renderApprovalForm(),
    ];
    const hostileFieldIds = [
      `slider\"]\\[data-action=\"submit`,
      `color']\\,[data-action='cancel`,
      `brackets[]\\quotes\"'`,
    ];
    roots.push(
      renderers.renderFieldInput({ id: hostileFieldIds[0], type: "slider" }),
      renderers.renderFieldInput({ id: hostileFieldIds[1], type: "color" }),
      renderers.renderFieldInput({ id: hostileFieldIds[2], type: "slider" }),
    );
    const nodes = roots.flatMap(function walk(node): FakeNode[] {
      return [node, ...node.children.flatMap(walk)];
    });
    const activeTags = new Set(["SCRIPT", "IMG", "SVG", "MATH", "IFRAME", "OBJECT", "EMBED"]);
    assert.deepEqual(nodes.filter(node => activeTags.has(node.tagName)), []);
    assert.ok(nodes.every(node => !Object.keys(node).some(name => /^on/i.test(name))), "no handler properties are created");
    const renderedText = roots.map(root => root.textContent).join("\n");
    for (const payload of payloads) assert.ok(renderedText.includes(payload), `payload was not preserved literally: ${payload}`);
    assert.ok(nodes.some(node => node.placeholder === payloads[1]), "hostile placeholder remains a property value");
    assert.ok(nodes.some(node => node.value === payloads[1]), "hostile input value remains a property value");
    assert.ok(nodes.some(node => node.dataset.fieldId === hostileFieldIds[0]));
    assert.ok(nodes.some(node => node.dataset.sliderDisplay === hostileFieldIds[0]));
    assert.ok(nodes.some(node => node.dataset.fieldId === hostileFieldIds[1]));
    assert.ok(nodes.some(node => node.dataset.colorDisplay === hostileFieldIds[1]));
    assert.ok(nodes.some(node => node.dataset.fieldId === hostileFieldIds[2]));
    assert.ok(nodes.some(node => node.dataset.sliderDisplay === hostileFieldIds[2]));
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
