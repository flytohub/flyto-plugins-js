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

  describe("bridge injection — requestId script-injection hardening", () => {
    it("should neutralize a JS string-breakout payload in __flyto_req", async () => {
      tmpDir = createTempUI("<html><head><title>Test</title></head><body>content</body></html>");
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      // Attacker-controllable __flyto_req value that, if interpolated raw into
      // `const REQ_ID = '<here>';`, would break out of the string literal and
      // execute arbitrary JS.
      const payload = "'; window.__pwned = true; var x='";
      const res = await fetch(
        `http://127.0.0.1:${port}/?__flyto_req=${encodeURIComponent(payload)}`,
      );
      assert.equal(res.status, 200);
      const html = await res.text();

      // Vulnerable behavior would interpolate the raw payload into a
      // single-quoted literal: `const REQ_ID = '<payload>';`. That exact,
      // string-breaking form must NOT appear.
      assert.ok(
        !html.includes(`const REQ_ID = '${payload}'`),
        "requestId was interpolated raw into a single-quoted literal (breakout possible)",
      );
      // The payload must NOT escape into an executable top-level statement.
      // After the fix the assignment is a balanced JSON string literal, so the
      // bare statement `window.__pwned = true;` only exists *inside* quotes.
      // The whole, correctly-serialized REQ_ID line must be present verbatim.
      assert.ok(
        html.includes(`const REQ_ID = ${JSON.stringify(payload)};`),
        "REQ_ID was not safely serialized as a JSON string literal",
      );
    });

    it("should neutralize a </script> breakout payload in __flyto_req", async () => {
      tmpDir = createTempUI("<html><head><title>Test</title></head><body>content</body></html>");
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const payload = "</script><img src=x onerror=alert(1)>";
      const res = await fetch(
        `http://127.0.0.1:${port}/?__flyto_req=${encodeURIComponent(payload)}`,
      );
      assert.equal(res.status, 200);
      const html = await res.text();

      // Isolate the injected REQ_ID assignment line.
      const reqLine = html.split("\n").find((l) => l.includes("const REQ_ID ="));
      assert.ok(reqLine, "REQ_ID line missing from injected script");

      // The `<` chars from the payload must be unicode-escaped (<), so the
      // HTML parser cannot see `</script>` (which would terminate the injected
      // script) nor an `<img ...>` element. The raw breakout form must be gone.
      assert.ok(
        !reqLine!.includes("</script>"),
        "closing-script sequence survived unescaped in the REQ_ID line",
      );
      assert.ok(
        !reqLine!.includes("<img"),
        "an <img tag survived unescaped in the REQ_ID line",
      );
      // Confirm the safe, escaped serialization is what actually got emitted.
      assert.ok(
        reqLine!.includes("\\u003c/script\\u003e"),
        "payload `<` was not unicode-escaped",
      );
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
