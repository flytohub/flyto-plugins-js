// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Tests for UIServer — HTTP serving, callback handling, bridge injection.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vm from "node:vm";
import { UIServer } from "./ui-server.js";

/** Create a temp directory with an index.html */
function createTempUI(html: string = "<html><head></head><body>Hello</body></html>"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flyto-ui-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

/** Extract the first exact script element without a permissive tag-matching regex. */
function firstScriptBody(html: string): string | undefined {
  const lower = html.toLowerCase();
  let cursor = 0;
  const tagEnd = (start: number): number => {
    let quote = "";
    for (let index = start; index < html.length; index += 1) {
      const char = html[index];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") return index;
    }
    return -1;
  };
  while (cursor < html.length) {
    const opening = lower.indexOf("<script", cursor);
    if (opening < 0) return undefined;
    const boundary = lower[opening + 7];
    if (boundary && boundary !== ">" && !/\s/.test(boundary)) {
      cursor = opening + 7;
      continue;
    }
    const openingEnd = tagEnd(opening + 7);
    if (openingEnd < 0) return undefined;
    let closing = lower.indexOf("</script", openingEnd + 1);
    while (closing >= 0) {
      const closingBoundary = lower[closing + 8];
      if (!closingBoundary || closingBoundary === ">" || /\s/.test(closingBoundary)) break;
      closing = lower.indexOf("</script", closing + 8);
    }
    if (closing < 0) return undefined;
    if (tagEnd(closing + 8) < 0) return undefined;
    return html.slice(openingEnd + 1, closing);
  }
  return undefined;
}

describe("UIServer", () => {
  let server: UIServer;
  let tmpDir: string;
  let outsideDir: string;

  afterEach(async () => {
    if (server) await server.stop();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    if (outsideDir && fs.existsSync(outsideDir)) {
      fs.rmSync(outsideDir, { recursive: true });
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
      assert.equal(server.getPort(), 0);
    });

    it("should reject missing UI roots", () => {
      assert.throws(() => new UIServer({ uiRoot: "/definitely/missing/flyto2-ui" }), /existing directory/);
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

    it("should prevent symlinks from escaping the real UI root", async () => {
      tmpDir = createTempUI();
      outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "flyto-ui-outside-"));
      fs.writeFileSync(path.join(outsideDir, "secret.txt"), "outside-secret");
      fs.symlinkSync(path.join(outsideDir, "secret.txt"), path.join(tmpDir, "linked.txt"));
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/linked.txt`);
      assert.equal(res.status, 403);
      assert.ok(!(await res.text()).includes("outside-secret"));
    });
  });

  describe("bridge injection — requestId script-injection hardening", () => {
    it("finds exact script boundaries across case, nesting, and malformed lookalikes", () => {
      assert.equal(firstScriptBody("<SCRIPT data-note='>'>safe()</ScRiPt >"), "safe()");
      assert.equal(firstScriptBody("<scripture>bad()</scripture><script>good()</script>"), "good()");
      assert.equal(firstScriptBody("<script>outer<script>nested</script>tail</script>"), "outer<script>nested");
      assert.equal(firstScriptBody("<script data-note='unterminated>bad()</script>"), undefined);
      assert.equal(firstScriptBody("<script>bad()</scripture>"), undefined);
    });

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

    it("should safely serialize props containing quotes and closing script tags", async () => {
      tmpDir = createTempUI("<html><head></head><body>content</body></html>");
      server = new UIServer({ uiRoot: tmpDir });
      await server.start();
      const payload = { value: "'</script><img src=x onerror=alert(1)>" };
      const url = server.buildUIUrl("index.html", "props-test", payload);

      const res = await fetch(url);
      assert.equal(res.status, 200);
      const html = await res.text();
      const propsLine = html.split("\n").find((line) => line.includes("const PROPS ="));

      assert.ok(propsLine, "PROPS line missing from injected script");
      assert.ok(!propsLine!.includes("</script>"), "closing-script sequence survived in props");
      assert.ok(!propsLine!.includes("<img"), "HTML tag survived in props");
      assert.ok(propsLine!.includes("JSON.parse(decodeURIComponent("));
    });

    it("should enforce the injected bridge data and theme contract", async () => {
      tmpDir = createTempUI("<html><head></head><body>content</body></html>");
      server = new UIServer({ uiRoot: tmpDir });
      await server.start();
      const html = await (await fetch(server.buildUIUrl("index.html", "bridge-contract"))).text();
      const script = firstScriptBody(html);
      assert.ok(script, "injected bridge script missing");

      const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
      const posted: unknown[][] = [];
      const styles: Array<[string, string]> = [];
      const parent = { postMessage: (...args: unknown[]) => posted.push(args) };
      const windowObject: Record<string, unknown> = {
        parent,
        addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => {
          listeners[name] = handler;
        },
      };
      const sandbox = {
        window: windowObject,
        document: {
          documentElement: {
            style: { setProperty: (key: string, value: string) => styles.push([key, value]) },
          },
        },
        fetch: async () => ({ ok: false, status: 503 }),
        JSON,
        Object,
        Array,
        Error,
        TypeError,
        decodeURIComponent,
      };
      vm.runInNewContext(script, sandbox);
      await new Promise((resolve) => setImmediate(resolve));

      const bridge = windowObject.flyto as {
        submit: (data: unknown) => void;
        onTheme: (handler: (tokens: Record<string, string>) => void) => void;
      };
      assert.throws(() => bridge.submit(null), /must be an object/);
      const themeUpdates: Array<Record<string, string>> = [];
      bridge.onTheme((tokens) => themeUpdates.push(tokens));
      listeners.message({
        source: parent,
        data: "flyto-plugin:" + JSON.stringify({
          type: "theme",
          data: { "--flyto-primary": "#123456", color: "red", "--flyto-bad": 7 },
        }),
      });
      assert.deepEqual(styles, [["--flyto-primary", "#123456"]]);
      assert.equal(JSON.stringify(themeUpdates), JSON.stringify([{ "--flyto-primary": "#123456" }]));
      assert.ok(posted.length >= 1, "non-2xx callback should fall back to parent messaging");
    });
  });

  describe("CORS", () => {
    it("should echo only the same loopback origin", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const origin = `http://127.0.0.1:${port}`;
      const res = await fetch(`${origin}/`, { headers: { Origin: origin } });
      assert.equal(res.headers.get("access-control-allow-origin"), origin);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    });

    it("should handle OPTIONS preflight", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/`, { method: "OPTIONS" });
      assert.equal(res.status, 204);
    });

    it("should reject a cross-origin preflight", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();

      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example" },
      });
      assert.equal(res.status, 403);
      assert.equal(res.headers.get("access-control-allow-origin"), null);
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

    it("should reject unknown IDs, invalid types, and non-JSON bodies", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();
      const endpoint = `http://127.0.0.1:${port}/__flyto_callback`;

      const unknown = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cancel", requestId: "missing" }),
      });
      assert.equal(unknown.status, 404);

      const invalidType = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ready", requestId: "missing" }),
      });
      assert.equal(invalidType.status, 400);

      const wrongContentType = await fetch(endpoint, { method: "POST", body: "{}" });
      assert.equal(wrongContentType.status, 415);
    });

    it("should reject duplicate request IDs and invalid timeouts", async () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      const port = await server.start();
      const first = server.waitForUI({ requestId: "duplicate", timeoutMs: 5_000 });

      assert.throws(
        () => server.waitForUI({ requestId: "duplicate", timeoutMs: 5_000 }),
        /already pending/,
      );
      assert.throws(() => server.waitForUI({ requestId: "bad", timeoutMs: 0 }), /positive finite/);

      await fetch(`http://127.0.0.1:${port}/__flyto_callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cancel", requestId: "duplicate" }),
      });
      await first;
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

      const url = new URL(server.buildUIUrl("index page.html", "req&=123", { foo: "100% ready" }));
      assert.equal(url.origin, `http://127.0.0.1:${port}`);
      assert.equal(url.pathname, "/index%20page.html");
      assert.equal(url.searchParams.get("__flyto_port"), String(port));
      assert.equal(url.searchParams.get("__flyto_req"), "req&=123");
      assert.deepEqual(JSON.parse(url.searchParams.get("__flyto_props")!), { foo: "100% ready" });
    });

    it("should require the server to start before URL construction", () => {
      tmpDir = createTempUI();
      server = new UIServer({ uiRoot: tmpDir });
      assert.throws(() => server.buildUIUrl("index.html", "req"), /must be started/);
    });
  });
});
