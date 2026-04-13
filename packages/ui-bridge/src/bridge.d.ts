// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

export interface FlytoUIBridge {
  /** Current props from the host */
  readonly props: Record<string, unknown>;

  /** Submit the result and close the UI */
  submit(data: Record<string, unknown>): void;

  /** Cancel the UI without submitting */
  cancel(): void;

  /** Register handler for prop updates */
  onProps(handler: (props: Record<string, unknown>) => void): void;

  /** Register handler for theme token updates */
  onTheme(handler: (tokens: Record<string, string>) => void): void;
}

export interface BridgeOptions {
  /** Allowed parent origin for postMessage (default: '*') */
  origin?: string;
}

/** Create a new bridge instance with custom options */
export function createBridge(options?: BridgeOptions): FlytoUIBridge;

/** Get or create the default bridge singleton */
export function getBridge(): FlytoUIBridge;
