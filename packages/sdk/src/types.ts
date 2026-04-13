// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Flyto Plugin SDK — Type definitions
 */

/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: number | string;
}

/** JSON-RPC 2.0 response */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JsonRpcError;
  id: number | string;
}

/** JSON-RPC 2.0 error */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Step handler function */
export type StepHandler = (input: Record<string, unknown>, context: StepContext) => Promise<StepResult>;

/** Context passed to step handlers */
export interface StepContext {
  /** Execution ID for this workflow run */
  executionId?: string;
  /** Browser WebSocket endpoint (if browser context is available) */
  browserWsEndpoint?: string;
  /** Browser session token for authentication */
  browserSessionToken?: string;
  /** Resolved secrets */
  secrets?: Record<string, string>;
  /** Raw context from core */
  raw: Record<string, unknown>;
}

/** Step execution result */
export interface StepResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

/** Plugin configuration */
export interface PluginConfig {
  /** Unique plugin identifier (e.g., "flyto-community/slack") */
  id: string;
  /** Plugin version */
  version: string;
  /** Plugin display name */
  name?: string;
}

/** Handshake params from core */
export interface HandshakeParams {
  protocolVersion: string;
  pluginId: string;
  executionId: string;
}

/** Invoke params from core */
export interface InvokeParams {
  step: string;
  input: Record<string, unknown>;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timeoutMs?: number;
}

// ── UI Types ──────────────────────────────────────────────

/** Configuration for a step's UI */
export interface StepUIConfig {
  /** Path to the UI directory (relative to plugin root) */
  page: string;
  /** UI display mode */
  type?: "page" | "panel" | "dialog";
  /** Default width in pixels */
  width?: number;
  /** Default height in pixels */
  height?: number;
  /** Props to pass to the UI */
  props?: Record<string, unknown>;
  /** Timeout in milliseconds for waiting on user interaction */
  timeoutMs?: number;
}

/** Result returned from a UI interaction */
export interface UIResult {
  /** Whether the user submitted (true) or cancelled (false) */
  submitted: boolean;
  /** Data submitted by the user */
  data: Record<string, unknown>;
}

/** Configuration for the UI HTTP server */
export interface UIServerConfig {
  /** Root directory for static UI files */
  uiRoot: string;
}

/** Options for waitForUI */
export interface UIWaitOptions {
  /** Unique request ID (auto-generated if omitted) */
  requestId?: string;
  /** Timeout in ms (default: 300000 = 5 min) */
  timeoutMs?: number;
}

/** Extended context passed to UI-enabled step handlers */
export interface UIStepContext extends StepContext {
  /**
   * Open a UI page and wait for the user to submit or cancel.
   *
   * @param config — UI configuration (page path, props, display mode)
   * @returns Promise that resolves when user submits/cancels
   */
  waitForUI(config: StepUIConfig): Promise<UIResult>;
}

/** Step handler for UI-enabled steps */
export type UIStepHandler = (
  input: Record<string, unknown>,
  context: UIStepContext
) => Promise<StepResult>;
