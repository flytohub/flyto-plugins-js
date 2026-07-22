import type { FlytoUIBridge } from "./bridge.js";

declare global {
  /** Browser global installed by the auto bridge entry point. */
  interface Window {
    flyto: FlytoUIBridge;
  }
}

export {};
