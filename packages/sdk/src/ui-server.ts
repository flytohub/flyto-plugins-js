// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto2 Plugin SDK — Embedded UI Server
 *
 * Lightweight HTTP server that:
 * 1. Serves plugin UI static files (HTML/CSS/JS/images)
 * 2. Injects the bridge script for host communication
 * 3. Receives callback POSTs when the user submits/cancels
 * 4. Serves ui-bridge and ui-tokens as virtual paths
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
import type { UIServerConfig, UIResult, UIWaitOptions } from "./types.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** Find a bridge package file relative to the SDK */
function findBridgeFile(filename: string): string | null {
  // Try sibling package (monorepo workspace)
  const monorepo = path.resolve(__dirname, "../../ui-bridge/src", filename);
  if (fs.existsSync(monorepo)) return monorepo;

  // Try node_modules
  try {
    const request = filename === "auto.js"
      ? "@flyto2/plugin-ui-bridge/auto"
      : "@flyto2/plugin-ui-bridge";
    const resolved = require.resolve(request);
    return resolved;
  } catch {
    return null;
  }
}

/** Find a tokens package file relative to the SDK */
function findTokensFile(filename: string): string | null {
  const monorepo = path.resolve(__dirname, "../../ui-tokens/src", filename);
  if (fs.existsSync(monorepo)) return monorepo;

  try {
    const resolved = require.resolve("@flyto2/plugin-ui-tokens/tokens.css");
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Serialize a value for safe embedding inside an inline <script> as a JS literal.
 *
 * JSON.stringify alone is NOT enough: characters such as `<` (in `</script>`),
 * U+2028 and U+2029 are valid in JSON strings but break out of / terminate an
 * inline script when the HTML parser sees them. We escape them to their unicode
 * forms so the embedded value can never close the script tag or break the JS.
 */
function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * Build the HTML wrapper that injects bridge + tokens.
 */
function buildInjectionScript(port: number, requestId: string, props: Record<string, unknown>): string {
  const encodedProps = encodeURIComponent(JSON.stringify(props));
  return `
<script>
  // Flyto2 Plugin Bridge — auto-injected by SDK
  (function() {
    const FLYTO_MSG_PREFIX = 'flyto-plugin:';
    const PORT = ${port};
    const REQ_ID = ${serializeForScript(requestId)};
    const PROPS = JSON.parse(decodeURIComponent(${serializeForScript(encodedProps)}));

    let currentProps = PROPS;
    const propsHandlers = [];
    const themeHandlers = [];

    function postToParent(type, data) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          FLYTO_MSG_PREFIX + JSON.stringify({ type, data, requestId: REQ_ID }),
          '*'
        );
      }
    }

    function sendToHost(type, data) {
      const message = JSON.stringify({ type, data, requestId: REQ_ID });
      // HTTP callback to SDK server
      fetch('http://127.0.0.1:' + PORT + '/__flyto_callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message,
      }).then(function(response) {
        if (!response.ok) throw new Error('Callback failed with HTTP ' + response.status);
      }).catch(function() {
        postToParent(type, data);
      });
    }

    // Listen for host messages (theme updates, prop updates)
    window.addEventListener('message', function(event) {
      if (event.source !== window.parent) return;
      if (typeof event.data !== 'string') return;
      if (event.data.indexOf(FLYTO_MSG_PREFIX) !== 0) return;
      try {
        var payload = JSON.parse(event.data.slice(FLYTO_MSG_PREFIX.length));
        if (payload.type === 'props') {
          currentProps = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
            ? payload.data
            : {};
          propsHandlers.forEach(function(h) { h(currentProps); });
        }
        if (payload.type === 'theme') {
          var tokens = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
            ? payload.data
            : {};
          var appliedTokens = {};
          var root = document.documentElement;
          Object.keys(tokens).forEach(function(key) {
            if (key.indexOf('--flyto-') === 0 && typeof tokens[key] === 'string') {
              root.style.setProperty(key, tokens[key]);
              appliedTokens[key] = tokens[key];
            }
          });
          themeHandlers.forEach(function(h) { h(appliedTokens); });
        }
      } catch(e) {}
    });

    window.flyto = {
      get props() { return currentProps; },
      submit: function(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new TypeError('Bridge submit data must be an object');
        }
        sendToHost('submit', data);
      },
      cancel: function() { sendToHost('cancel', null); },
      onProps: function(handler) {
        if (typeof handler !== 'function') throw new TypeError('onProps handler must be a function');
        propsHandlers.push(handler);
        if (Object.keys(currentProps).length > 0) handler(currentProps);
      },
      onTheme: function(handler) {
        if (typeof handler !== 'function') throw new TypeError('onTheme handler must be a function');
        themeHandlers.push(handler);
      },
    };

    sendToHost('ready', {});
  })();
</script>`;
}

/** Serves one confined plugin UI root and capability-bound callbacks. */
export class UIServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private uiRoot: string;
  private pendingRequests = new Map<string, {
    resolve: (result: UIResult) => void;
    reject: (error: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>();

  /** Resolve and validate the static-file root before binding a listener. */
  constructor(config: UIServerConfig) {
    if (!config?.uiRoot || typeof config.uiRoot !== "string") {
      throw new TypeError("UIServer uiRoot must be a non-empty path");
    }
    const resolvedRoot = path.resolve(config.uiRoot);
    if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
      throw new TypeError("UIServer uiRoot must reference an existing directory");
    }
    this.uiRoot = fs.realpathSync(resolvedRoot);
  }

  /** Start the HTTP server. Returns the port it's listening on. */
  async start(): Promise<number> {
    if (this.server) return this.port;

    this.server = http.createServer((req, res) => {
      try {
        this.handleRequest(req, res);
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        }
        res.end("Internal server error");
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();
        if (!address || typeof address === "string") {
          reject(new Error("UI server did not expose a TCP port"));
          return;
        }
        this.port = address.port;
        resolve(this.port);
      });
      this.server!.once("error", reject);
    });
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    if (!this.server) return;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new Error("UI server stopped"));
    }
    this.pendingRequests.clear();

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.port = 0;
        resolve();
      });
    });
  }

  /** Get the current port (0 if not started). */
  getPort(): number {
    return this.port;
  }

  /**
   * Wait for the user to submit or cancel from the UI.
   * Returns a promise that resolves with the UI result.
   */
  waitForUI(options: UIWaitOptions): Promise<UIResult> {
    const requestId = options.requestId || randomUUID();
    const timeoutMs = options.timeoutMs ?? 300_000; // 5 min default
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("UI timeoutMs must be a positive finite number");
    }
    if (this.pendingRequests.has(requestId)) {
      throw new Error(`UI request '${requestId}' is already pending`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`UI wait timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
  }

  /**
   * Build the full URL for a UI page.
   */
  buildUIUrl(page: string, requestId: string, props: Record<string, unknown> = {}): string {
    if (!this.server || this.port === 0) {
      throw new Error("UI server must be started before building a URL");
    }
    const url = new URL(`http://127.0.0.1:${this.port}`);
    url.pathname = page.startsWith("/") ? page : `/${page}`;
    url.searchParams.set("__flyto_port", String(this.port));
    url.searchParams.set("__flyto_req", requestId);
    url.searchParams.set("__flyto_props", JSON.stringify(props));
    return url.toString();
  }

  /** Route one loopback HTTP request and apply baseline response hardening. */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      `http://127.0.0.1:${this.port}`,
      `http://localhost:${this.port}`,
    ]);
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204);
      res.end();
      return;
    }

    // Callback endpoint — receives submit/cancel from the UI
    if (pathname === "/__flyto_callback" && req.method === "POST") {
      if (origin && !allowedOrigins.has(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Origin not allowed" }));
        return;
      }
      this.handleCallback(req, res);
      return;
    }

    // Serve virtual paths for bridge and tokens
    if (pathname === "/__flyto/bridge.js") {
      this.serveVirtualFile(res, findBridgeFile("bridge.js"), ".js");
      return;
    }
    if (pathname === "/__flyto/auto.js") {
      this.serveVirtualFile(res, findBridgeFile("auto.js"), ".js");
      return;
    }
    if (pathname === "/__flyto/tokens.css") {
      this.serveVirtualFile(res, findTokensFile("tokens.css"), ".css");
      return;
    }

    // Serve static files from the UI root
    this.serveStaticFile(req, res, pathname);
  }

  /** Validate and resolve a submit/cancel callback for a pending request ID. */
  private handleCallback(req: http.IncomingMessage, res: http.ServerResponse): void {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      res.writeHead(415, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Content-Type must be application/json" }));
      return;
    }
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
    let body = "";
    let bodyBytes = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      body += chunk;
      bodyBytes += Buffer.byteLength(chunk);
      if (bodyBytes > MAX_BODY_SIZE) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Payload too large" }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new TypeError("Callback body must be an object");
        }
        const { type, data, requestId } = payload;
        if (type !== "submit" && type !== "cancel") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Callback type must be submit or cancel" }));
          return;
        }
        if (typeof requestId !== "string" || !requestId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "requestId is required" }));
          return;
        }

        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Unknown or completed requestId" }));
          return;
        }
        if (type === "submit" && (data === null || typeof data !== "object" || Array.isArray(data))) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Submit data must be an object" }));
          return;
        }

        if (pending.timeout) clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        pending.resolve(type === "submit"
          ? { submitted: true, data: data as Record<string, unknown> }
          : { submitted: false, data: {} });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
  }

  /** Serve one SDK-owned bridge or token asset. */
  private serveVirtualFile(res: http.ServerResponse, filePath: string | null, ext: string): void {
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
    res.end(content);
  }

  /** Resolve and serve one static UI file without crossing the real UI root. */
  private serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
    // Resolve file path — default to index.html for root
    let filePath = path.join(this.uiRoot, pathname);

    // If directory or root, try index.html
    if (pathname === "/" || pathname.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }

    // Security: prevent path traversal
    const root = fs.realpathSync(this.uiRoot);
    const resolved = path.resolve(filePath);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check if file exists — try a directory index or .html extension.
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      filePath = path.join(resolved, "index.html");
    } else if (!fs.existsSync(resolved)) {
      const withHtml = resolved + ".html";
      if (fs.existsSync(withHtml)) {
        filePath = withHtml;
      } else {
        // SPA fallback: serve index.html
        filePath = path.join(this.uiRoot, "index.html");
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
      }
    } else {
      filePath = resolved;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const realFile = fs.realpathSync(filePath);
    const realRelative = path.relative(root, realFile);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    filePath = realFile;

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // For HTML files, inject the bridge script
    if (ext === ".html") {
      let html = fs.readFileSync(filePath, "utf-8");

      // Extract request params from the original URL
      const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
      const requestId = url.searchParams.get("__flyto_req") || "";
      let props: Record<string, unknown> = {};
      try {
        const raw = url.searchParams.get("__flyto_props");
        if (raw) props = JSON.parse(raw);
      } catch { /* ignore */ }

      // Inject tokens CSS + bridge script before </head> or at start
      const injection =
        `<link rel="stylesheet" href="/__flyto/tokens.css">\n` +
        buildInjectionScript(this.port, requestId, props);

      if (html.includes("</head>")) {
        html = html.replace("</head>", injection + "\n</head>");
      } else if (html.includes("<body")) {
        html = html.replace("<body", injection + "\n<body");
      } else {
        html = injection + "\n" + html;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(html);
      return;
    }

    // Stream other files
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
