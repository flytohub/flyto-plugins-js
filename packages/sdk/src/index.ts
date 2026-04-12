// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * @flyto/plugin-sdk
 *
 * SDK for building Flyto2 plugins in TypeScript/JavaScript.
 *
 * Usage:
 *   import { createPlugin } from '@flyto/plugin-sdk';
 *
 *   const plugin = createPlugin({ id: 'my-plugin', version: '1.0.0' });
 *
 *   plugin.step('my_step', async (input, ctx) => {
 *     return { ok: true, data: { result: 'hello' } };
 *   });
 *
 *   plugin.start();
 */

export { FlytoPlugin } from "./plugin.js";
export type {
  PluginConfig,
  StepHandler,
  StepContext,
  StepResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types.js";

import type { PluginConfig } from "./types.js";
import { FlytoPlugin } from "./plugin.js";

/**
 * Create a new Flyto plugin instance.
 *
 * @param config - Plugin configuration (id, version)
 * @returns FlytoPlugin instance with step() and start() methods
 */
export function createPlugin(config: PluginConfig): FlytoPlugin {
  return new FlytoPlugin(config);
}
