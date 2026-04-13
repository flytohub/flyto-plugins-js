// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for UIServer — HTTP serving, callback handling, bridge injection.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { UIServer } from "./ui-server.js";

/** Create a temp directory with an index.html */
function createTempUI(html: string = "<html><head></head><body>Hello</body></html>"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flyto-ui-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

describe("UIServer", () => {
  let server: UIServer;
  let tmpDir: string;

  afterEach(async () => {
    if (server) await server.stop();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("start/stop", () => {
    it("should start on a free port and stop cleanly", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });

      const port = await server.start();
      assert.ok(port > 0);
      assert.equal(server.getPort(), port);

      await server.stop();
      assert.equal(server.getPort(), port); // port is retained after stop
    });
  });

  describe("static file serving", () => {
    it("should serve index.html with bridge injection", async () => {
      tmpDir = createTempUI("<html><head><title>Test</title></head><body>content</body></html>");
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);

      const html = await res.text();
      // Should contain the original content
      assert.ok(html.includes("content"));
      // Should have injected the bridge script
      assert.ok(html.includes("window.flyto"));
      // Should have injected tokens CSS link
      assert.ok(html.includes("/__flyto/tokens.css"));
    });

    it("should serve CSS files without injection", async () => {
      tmpDir = createTempUI();
      fs.writeFileSync(path.join(tmpDir, "style.css"), "body { color: red; }");
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/style.css`);
      assert.equal(res.status, 200);

      const contentType = res.headers.get("content-type");
      assert.ok(contentType?.includes("text/css"));

      const css = await res.text();
      assert.equal(css, "body { color: red; }");
    });

    it("should return 404 for missing files when no index.html SPA fallback", async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flyto-ui-test-"));
      // No index.html at all
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/nonexistent.txt`);
      assert.equal(res.status, 404);
    });

    it("should prevent path traversal", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/../../../etc/passwd`);
      // Should either 403 or serve index.html (SPA fallback), not the actual file
      const text = await res.text();
      assert.ok(!text.includes("root:"));
    });
  });

  describe("CORS", () => {
    it("should include CORS headers", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
    });

    it("should handle OPTIONS preflight", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/`, { method: "OPTIONS" });
      assert.equal(res.status, 204);
    });
  });

  describe("callback", () => {
    it("should resolve waitForUI on submit callback", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const requestId = "test-req-1";

      // Start waiting (don't await yet)
      const waitPromise = server.waitForUI({ requestId, timeoutMs: 5000 });

      // Simulate the UI posting back
      await fetch(`http://127.0.0.1:${port}/__flyto_callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "submit",
          data: { croppedUrl: "data:image/png;base64,abc" },
          requestId,
        }),
      });

      const result = await waitPromise;
      assert.equal(result.submitted, true);
      assert.equal(result.data.croppedUrl, "data:image/png;base64,abc");
    });

    it("should resolve waitForUI on cancel callback", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const requestId = "test-req-2";
      const waitPromise = server.waitForUI({ requestId, timeoutMs: 5000 });

      await fetch(`http://127.0.0.1:${port}/__flyto_callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cancel", data: null, requestId }),
      });

      const result = await waitPromise;
      assert.equal(result.submitted, false);
    });

    it("should timeout if no callback received", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      await server.start();

      await assert.rejects(
        server.waitForUI({ requestId: "timeout-test", timeoutMs: 200 }),
        /timed out/
      );
    });
  });

  describe("buildUIUrl", () => {
    it("should build correct URL with params", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const url = server.buildUIUrl("index.html", "req-123", { foo: "bar" });
      assert.ok(url.includes(`http://127.0.0.1:${port}/index.html`));
      assert.ok(url.includes("__flyto_port="));
      assert.ok(url.includes("__flyto_req=req-123"));
      assert.ok(url.includes("__flyto_props="));
    });
  });
});
