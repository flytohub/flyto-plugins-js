// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto Plugin SDK — Embedded UI Server
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
import * as net from "net";
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
    const resolved = require.resolve(`@flyto/plugin-ui-bridge/${filename}`);
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
    const resolved = require.resolve(`@flyto/plugin-ui-tokens/${filename}`);
    return resolved;
  } catch {
    return null;
  }
}

/** Find a free port */
async function findFreePort(preferred: number = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(preferred, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      server.close(() => resolve(addr.port));
    });
    server.on("error", reject);
  });
}

/**
 * Build the HTML wrapper that injects bridge + tokens.
 */
function buildInjectionScript(port: number, requestId: string, props: Record<string, unknown>): string {
  const encodedProps = encodeURIComponent(JSON.stringify(props));
  return `
<script>
  // Flyto Plugin Bridge — auto-injected by SDK
  (function() {
    const FLYTO_MSG_PREFIX = 'flyto-plugin:';
    const PORT = ${port};
    const REQ_ID = '${requestId}';
    const PROPS = JSON.parse(decodeURIComponent('${encodedProps}'));

    let currentProps = PROPS;
    const propsHandlers = [];
    const themeHandlers = [];

    function sendToHost(type, data) {
      const message = JSON.stringify({ type, data, requestId: REQ_ID });
      // HTTP callback to SDK server
      fetch('http://127.0.0.1:' + PORT + '/__flyto_callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message,
      }).catch(function() {
        // Fallback: postMessage
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(FLYTO_MSG_PREFIX + message, '*');
        }
      });
    }

    // Listen for host messages (theme updates, prop updates)
    window.addEventListener('message', function(event) {
      if (typeof event.data !== 'string') return;
      if (event.data.indexOf(FLYTO_MSG_PREFIX) !== 0) return;
      try {
        var payload = JSON.parse(event.data.slice(FLYTO_MSG_PREFIX.length));
        if (payload.type === 'props') {
          currentProps = payload.data || {};
          propsHandlers.forEach(function(h) { h(currentProps); });
        }
        if (payload.type === 'theme') {
          var tokens = payload.data || {};
          var root = document.documentElement;
          Object.keys(tokens).forEach(function(key) {
            root.style.setProperty(key, tokens[key]);
          });
          themeHandlers.forEach(function(h) { h(tokens); });
        }
      } catch(e) {}
    });

    window.flyto = {
      get props() { return currentProps; },
      submit: function(data) { sendToHost('submit', data); },
      cancel: function() { sendToHost('cancel', null); },
      onProps: function(handler) {
        propsHandlers.push(handler);
        if (Object.keys(currentProps).length > 0) handler(currentProps);
      },
      onTheme: function(handler) { themeHandlers.push(handler); },
    };

    sendToHost('ready', {});
  })();
</script>`;
}

export class UIServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private uiRoot: string;
  private pendingRequests = new Map<string, {
    resolve: (result: UIResult) => void;
    reject: (error: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>();

  constructor(config: UIServerConfig) {
    this.uiRoot = config.uiRoot;
  }

  /** Start the HTTP server. Returns the port it's listening on. */
  async start(): Promise<number> {
    if (this.server) return this.port;

    this.port = await findFreePort();

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, "127.0.0.1", () => {
        resolve(this.port);
      });
      this.server!.on("error", reject);
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
    const requestId = options.requestId || crypto.randomUUID();
    const timeoutMs = options.timeoutMs || 300_000; // 5 min default

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
    const encodedProps = encodeURIComponent(JSON.stringify(props));
    const pagePath = page.startsWith("/") ? page : `/${page}`;
    return `http://127.0.0.1:${this.port}${pagePath}?__flyto_port=${this.port}&__flyto_req=${requestId}&__flyto_props=${encodedProps}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Callback endpoint — receives submit/cancel from the UI
    if (pathname === "/__flyto_callback" && req.method === "POST") {
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

  private handleCallback(req: http.IncomingMessage, res: http.ServerResponse): void {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
    let body = "";
    let aborted = false;
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
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
        const { type, data, requestId } = payload;

        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          if (pending.timeout) clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);

          if (type === "submit") {
            pending.resolve({ submitted: true, data: data || {} });
          } else if (type === "cancel") {
            pending.resolve({ submitted: false, data: {} });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
  }

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

  private serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
    // Resolve file path — default to index.html for root
    let filePath = path.join(this.uiRoot, pathname);

    // If directory or root, try index.html
    if (pathname === "/" || pathname.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }

    // Security: prevent path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.uiRoot))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check if file exists — try with .html extension
    if (!fs.existsSync(resolved)) {
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
        if (raw) props = JSON.parse(decodeURIComponent(raw));
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
