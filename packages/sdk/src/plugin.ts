// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto2 Plugin SDK — Plugin runtime
 *
 * Listens on stdin for JSON-RPC 2.0 messages from Flyto2 Core,
 * dispatches to registered step handlers, writes results to stdout.
 */

import * as readline from "readline";
import * as path from "path";
import { randomUUID } from "node:crypto";
import type {
  PluginConfig,
  StepHandler,
  StepContext,
  StepResult,
  StepUIConfig,
  UIResult,
  UIStepContext,
  UIStepHandler,
  JsonRpcRequest,
  JsonRpcResponse,
  HandshakeParams,
  InvokeParams,
} from "./types.js";
import { UIServer } from "./ui-server.js";

const PROTOCOL_VERSION = "0.1.0";
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const STEP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Owns plugin registration and JSON-RPC dispatch for one Node process. */
export class FlytoPlugin {
  private config: PluginConfig;
  private steps = new Map<string, StepHandler>();
  private uiSteps = new Map<string, UIStepHandler>();
  private uiConfigs = new Map<string, StepUIConfig>();
  private uiServers = new Map<string, UIServer>();
  private running = false;

  /** Validate and retain immutable plugin identity metadata. */
  constructor(config: PluginConfig) {
    if (!config || !PLUGIN_ID_PATTERN.test(config.id)) {
      throw new TypeError("Plugin id must use the 'vendor/name' format");
    }
    if (typeof config.version !== "string" || !SEMVER_PATTERN.test(config.version)) {
      throw new TypeError("Plugin version must be a semantic version");
    }
    this.config = Object.freeze({ ...config });
  }

  /**
   * Register a headless step handler.
   *
   * @param stepId - Step identifier (e.g., "send_message")
   * @param handler - Async function that processes input and returns result
   */
  step(stepId: string, handler: StepHandler): this {
    this.assertStepAvailable(stepId);
    if (typeof handler !== "function") throw new TypeError("Step handler must be a function");
    this.steps.set(stepId, handler);
    return this;
  }

  /**
   * Register a UI-enabled step handler.
   *
   * When invoked, the handler receives a context with `waitForUI()` that
   * starts a local HTTP server, serves the UI page, and waits for the
   * user to submit or cancel.
   *
   * @param stepId - Step identifier (e.g., "crop_image")
   * @param uiConfig - UI configuration (page path, type, dimensions)
   * @param handler - Async function with UI context
   */
  uiStep(stepId: string, uiConfig: StepUIConfig, handler: UIStepHandler): this {
    this.assertStepAvailable(stepId);
    this.assertUIConfig(uiConfig);
    if (typeof handler !== "function") throw new TypeError("UI step handler must be a function");
    this.uiSteps.set(stepId, handler);
    this.uiConfigs.set(stepId, Object.freeze({ ...uiConfig }));
    return this;
  }

  /**
   * Start listening for JSON-RPC messages on stdin.
   * This blocks until the process is terminated or shutdown is received.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on("line", async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        if (response) {
          this.send(response);
        }
      } catch (err) {
        // Parse error — can't respond without an ID
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[flyto-plugin] Parse error: ${errMsg}\n`);
      }
    });

    rl.on("close", () => {
      this.running = false;
      process.exit(0);
    });

    // Handle SIGTERM gracefully
    process.on("SIGTERM", async () => {
      this.running = false;
      await this.stopUIServer();
      process.exit(0);
    });
  }

  /** Validate and dispatch one parsed JSON-RPC request. */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      const id = request?.id;
      return id === undefined || id === null ? null : this.error(id, -32600, "Invalid Request");
    }
    const { method, params, id } = request;

    // Notifications (no id) don't get responses
    if (id === undefined || id === null) return null;

    switch (method) {
      case "handshake":
        return this.handleHandshake(params as unknown as HandshakeParams, id);

      case "invoke":
        return await this.handleInvoke(params as unknown as InvokeParams, id);

      case "ping":
        return this.success(id, { status: "ok" });

      case "shutdown":
        this.running = false;
        await this.stopUIServer();
        const response = this.success(id, { status: "shutdown" });
        // Exit after sending response
        setTimeout(() => process.exit(0), 100);
        return response;

      default:
        return this.error(id, -32601, `Method not found: ${method}`);
    }
  }

  /** Return this process's protocol version, steps, and UI metadata. */
  private handleHandshake(_params: HandshakeParams, id: number | string): JsonRpcResponse {
    // Merge headless + UI step IDs
    const allSteps = [
      ...Array.from(this.steps.keys()),
      ...Array.from(this.uiSteps.keys()),
    ];

    // Report UI metadata for steps that have it
    const uiMeta: Record<string, { type: string; width?: number; height?: number }> = {};
    for (const [stepId, config] of this.uiConfigs) {
      uiMeta[stepId] = {
        type: config.type || "page",
        width: config.width,
        height: config.height,
      };
    }

    return this.success(id, {
      pluginVersion: this.config.version,
      protocolVersion: PROTOCOL_VERSION,
      steps: allSteps,
      ui: Object.keys(uiMeta).length > 0 ? uiMeta : undefined,
    });
  }

  /** Execute a registered handler and normalize failures into a step result. */
  private async handleInvoke(params: InvokeParams, id: number | string): Promise<JsonRpcResponse> {
    if (!params || typeof params.step !== "string" || !params.step) {
      return this.error(id, -32602, "Invoke params require a non-empty step id");
    }
    const { step, input, context: rawContext } = params;
    if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
      return this.error(id, -32602, "Invoke input must be an object");
    }
    if (
      rawContext !== undefined
      && (rawContext === null || typeof rawContext !== "object" || Array.isArray(rawContext))
    ) {
      return this.error(id, -32602, "Invoke context must be an object");
    }

    const headlessHandler = this.steps.get(step);
    const uiHandler = this.uiSteps.get(step);

    if (!headlessHandler && !uiHandler) {
      return this.success(id, {
        ok: false,
        error: {
          code: "STEP_NOT_FOUND",
          message: `Step '${step}' is not registered in plugin '${this.config.id}'`,
        },
      });
    }

    const context = this.buildContext(rawContext || {});

    try {
      let result: StepResult;

      if (uiHandler) {
        // UI step — build context with waitForUI
        const uiContext = await this.buildUIContext(context, step);
        result = await uiHandler(input || {}, uiContext);
      } else {
        result = await headlessHandler!(input || {}, context);
      }

      if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
        throw new TypeError("Step handler must return an object with a boolean 'ok' field");
      }
      if (
        !result.ok
        && (!result.error || typeof result.error.code !== "string"
          || typeof result.error.message !== "string")
      ) {
        throw new TypeError("Failed step results require string error code and message fields");
      }

      return this.success(id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.success(id, {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message,
          retryable: false,
        },
      } satisfies StepResult);
    }
  }

  /** Map snake_case Core context fields to the public handler context. */
  private buildContext(raw: Record<string, unknown>): StepContext {
    const rawSecrets = raw.secrets;
    const secrets = rawSecrets && typeof rawSecrets === "object" && !Array.isArray(rawSecrets)
      ? Object.fromEntries(
        Object.entries(rawSecrets).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
      : undefined;
    return {
      executionId: typeof raw.execution_id === "string" ? raw.execution_id : undefined,
      browserWsEndpoint: typeof raw.browser_ws_endpoint === "string"
        ? raw.browser_ws_endpoint
        : undefined,
      browserSessionToken: typeof raw.browser_session_token === "string"
        ? raw.browser_session_token
        : undefined,
      secrets,
      raw,
    };
  }

  /** Add the UI wait capability for one registered interactive step. */
  private async buildUIContext(base: StepContext, stepId: string): Promise<UIStepContext> {
    const server = await this.ensureUIServer(stepId);
    const registeredConfig = this.uiConfigs.get(stepId)!;

    /** Open one UI interaction and wait for its capability-bound result. */
    const waitForUI = async (config: StepUIConfig): Promise<UIResult> => {
      const effectiveConfig = { ...registeredConfig, ...config };
      this.assertUIConfig(effectiveConfig);
      const requestId = randomUUID();
      const uiUrl = server.buildUIUrl(
        effectiveConfig.page.endsWith(".html") ? effectiveConfig.page : "index.html",
        requestId,
        effectiveConfig.props || {}
      );
      const pendingResult = server.waitForUI({
        requestId,
        timeoutMs: effectiveConfig.timeoutMs,
      });

      // Tell Flyto2 Core to open the UI only after the callback capability exists.
      this.send({
        jsonrpc: "2.0",
        method: "ui.open",
        params: {
          url: uiUrl,
          type: effectiveConfig.type || "page",
          width: effectiveConfig.width,
          height: effectiveConfig.height,
          requestId,
        },
      } as unknown as JsonRpcResponse);

      try {
        return await pendingResult;
      } finally {
        // Close host UI after submit, cancel, timeout, or server shutdown.
        this.send({
          jsonrpc: "2.0",
          method: "ui.close",
          params: { requestId },
        } as unknown as JsonRpcResponse);
      }
    };

    return { ...base, waitForUI };
  }

  /** Start or reuse the loopback server assigned to a step's UI root. */
  private async ensureUIServer(stepId: string): Promise<UIServer> {
    const config = this.uiConfigs.get(stepId);
    if (!config) {
      throw new Error(`No UI config for step '${stepId}'`);
    }

    // Resolve UI root relative to the plugin's working directory
    const uiRoot = path.resolve(process.cwd(), config.page);
    const existing = this.uiServers.get(uiRoot);
    if (existing) return existing;

    const server = new UIServer({ uiRoot });
    await server.start();
    this.uiServers.set(uiRoot, server);

    process.stderr.write(
      `[flyto-plugin] UI server started on port ${server.getPort()} serving ${uiRoot}\n`
    );

    return server;
  }

  /** Stop every loopback UI server owned by this plugin process. */
  private async stopUIServer(): Promise<void> {
    const servers = Array.from(this.uiServers.values());
    this.uiServers.clear();
    await Promise.all(servers.map((server) => server.stop()));
  }

  /** Write one protocol message to stdout. */
  private send(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  /** Build a successful JSON-RPC response. */
  private success(id: number | string, result: unknown): JsonRpcResponse {
    return { jsonrpc: "2.0", result, id };
  }

  /** Build a JSON-RPC error response. */
  private error(id: number | string, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", error: { code, message }, id };
  }

  /** Reject invalid or duplicate step identifiers before process startup. */
  private assertStepAvailable(stepId: string): void {
    if (!STEP_ID_PATTERN.test(stepId)) {
      throw new TypeError("Step id must contain 1-128 letters, numbers, dots, underscores, or hyphens");
    }
    if (this.steps.has(stepId) || this.uiSteps.has(stepId)) {
      throw new Error(`Step '${stepId}' is already registered`);
    }
  }

  /** Enforce the documented relative UI-root and timeout contract. */
  private assertUIConfig(config: StepUIConfig): void {
    if (!config || typeof config.page !== "string" || !config.page.trim()) {
      throw new TypeError("UI config page must be a non-empty relative directory");
    }
    const portablePage = config.page.replace(/\\/g, "/");
    const normalized = path.normalize(portablePage);
    if (
      path.isAbsolute(normalized)
      || path.win32.isAbsolute(config.page)
      || portablePage.split("/").includes("..")
      || config.page.includes("\0")
    ) {
      throw new TypeError("UI config page must stay inside the plugin root");
    }
    if (config.type !== undefined && !["page", "panel", "dialog"].includes(config.type)) {
      throw new TypeError("UI type must be page, panel, or dialog");
    }
    for (const [name, value] of [["width", config.width], ["height", config.height]] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 10_000)) {
        throw new TypeError(`UI ${name} must be a positive number no greater than 10000`);
      }
    }
    if (
      config.props !== undefined
      && (config.props === null || typeof config.props !== "object" || Array.isArray(config.props))
    ) {
      throw new TypeError("UI props must be an object");
    }
    if (
      config.timeoutMs !== undefined
      && (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0)
    ) {
      throw new TypeError("UI timeoutMs must be a positive finite number");
    }
  }
}
