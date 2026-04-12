// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto Plugin SDK — Plugin runtime
 *
 * Listens on stdin for JSON-RPC 2.0 messages from flyto-core,
 * dispatches to registered step handlers, writes results to stdout.
 */

import * as readline from "readline";
import type {
  PluginConfig,
  StepHandler,
  StepContext,
  StepResult,
  JsonRpcRequest,
  JsonRpcResponse,
  HandshakeParams,
  InvokeParams,
} from "./types.js";

const PROTOCOL_VERSION = "0.1.0";

export class FlytoPlugin {
  private config: PluginConfig;
  private steps = new Map<string, StepHandler>();
  private running = false;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Register a step handler.
   *
   * @param stepId - Step identifier (e.g., "send_message")
   * @param handler - Async function that processes input and returns result
   */
  step(stepId: string, handler: StepHandler): this {
    this.steps.set(stepId, handler);
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
    process.on("SIGTERM", () => {
      this.running = false;
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
        const response = this.success(id, { status: "shutdown" });
        // Exit after sending response
        setTimeout(() => process.exit(0), 100);
        return response;

      default:
        return this.error(id, -32601, `Method not found: ${method}`);
    }
  }

  private handleHandshake(params: HandshakeParams, id: number | string): JsonRpcResponse {
    return this.success(id, {
      pluginVersion: this.config.version,
      protocolVersion: PROTOCOL_VERSION,
      steps: Array.from(this.steps.keys()),
    });
  }

  private async handleInvoke(params: InvokeParams, id: number | string): Promise<JsonRpcResponse> {
    const { step, input, context: rawContext } = params;

    const handler = this.steps.get(step);
    if (!handler) {
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
      const result = await handler(input || {}, context);
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
