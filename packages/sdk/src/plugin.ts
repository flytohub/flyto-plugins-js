// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto Plugin SDK — Plugin runtime
 *
 * Listens on stdin for JSON-RPC 2.0 messages from flyto-core,
 * dispatches to registered step handlers, writes results to stdout.
 */

import * as readline from "readline";
import * as path from "path";
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

export class FlytoPlugin {
  private config: PluginConfig;
  private steps = new Map<string, StepHandler>();
  private uiSteps = new Map<string, UIStepHandler>();
  private uiConfigs = new Map<string, StepUIConfig>();
  private uiServer: UIServer | null = null;
  private running = false;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Register a headless step handler.
   *
   * @param stepId - Step identifier (e.g., "send_message")
   * @param handler - Async function that processes input and returns result
   */
  step(stepId: string, handler: StepHandler): this {
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
    this.uiSteps.set(stepId, handler);
    this.uiConfigs.set(stepId, uiConfig);
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

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
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

  private handleHandshake(params: HandshakeParams, id: number | string): JsonRpcResponse {
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

  private async handleInvoke(params: InvokeParams, id: number | string): Promise<JsonRpcResponse> {
    const { step, input, context: rawContext } = params;

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

  private buildContext(raw: Record<string, unknown>): StepContext {
    return {
      executionId: raw.execution_id as string | undefined,
      browserWsEndpoint: raw.browser_ws_endpoint as string | undefined,
      browserSessionToken: raw.browser_session_token as string | undefined,
      secrets: raw.secrets as Record<string, string> | undefined,
      raw,
    };
  }

  private async buildUIContext(base: StepContext, stepId: string): Promise<UIStepContext> {
    const server = await this.ensureUIServer(stepId);

    const waitForUI = async (config: StepUIConfig): Promise<UIResult> => {
      const requestId = crypto.randomUUID();
      const uiUrl = server.buildUIUrl(
        config.page.endsWith(".html") ? config.page : "index.html",
        requestId,
        config.props || {}
      );

      // Tell flyto-core to open the UI
      this.send({
        jsonrpc: "2.0",
        method: "ui.open",
        params: {
          url: uiUrl,
          type: config.type || "page",
          width: config.width,
          height: config.height,
          requestId,
        },
      } as unknown as JsonRpcResponse);

      // Wait for user to submit/cancel
      const result = await server.waitForUI({
        requestId,
        timeoutMs: config.timeoutMs,
      });

      // Tell flyto-core the UI is done
      this.send({
        jsonrpc: "2.0",
        method: "ui.close",
        params: { requestId },
      } as unknown as JsonRpcResponse);

      return result;
    };

    return { ...base, waitForUI };
  }

  private async ensureUIServer(stepId: string): Promise<UIServer> {
    if (this.uiServer) return this.uiServer;

    const config = this.uiConfigs.get(stepId);
    if (!config) {
      throw new Error(`No UI config for step '${stepId}'`);
    }

    // Resolve UI root relative to the plugin's working directory
    const uiRoot = path.resolve(process.cwd(), config.page);
    this.uiServer = new UIServer({ uiRoot });
    await this.uiServer.start();

    process.stderr.write(
      `[flyto-plugin] UI server started on port ${this.uiServer.getPort()} serving ${uiRoot}\n`
    );

    return this.uiServer;
  }

  private async stopUIServer(): Promise<void> {
    if (this.uiServer) {
      await this.uiServer.stop();
      this.uiServer = null;
    }
  }

  private send(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  private success(id: number | string, result: unknown): JsonRpcResponse {
    return { jsonrpc: "2.0", result, id };
  }

  private error(id: number | string, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", error: { code, message }, id };
  }
}
