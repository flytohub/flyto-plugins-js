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
