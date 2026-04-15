// Copyright 2026 Flyto2. Licensed under Apache-2.0. See LICENSE.

/**
 * Programmatic token injection — used by the SDK bridge to override
 * CSS variables at runtime (e.g., when the host sends a theme update).
 *
 * Usage:
 *   import { injectTokens } from '@flyto2/plugin-ui-tokens/inject';
 *   injectTokens({ '--flyto-primary': '#8b5cf6', ... });
 */

/**
 * @param {Record<string, string>} tokens — CSS variable name → value
 * @param {HTMLElement} [target=document.documentElement]
 */
export function injectTokens(tokens, target) {
  const el = target || document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Read all --flyto-* variables from the computed style.
 * @returns {Record<string, string>}
 */
export function readTokens() {
  const style = getComputedStyle(document.documentElement);
  const tokens = {};
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':root') {
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (prop.startsWith('--flyto-')) {
              tokens[prop] = style.getPropertyValue(prop).trim();
            }
          }
        }
      }
    } catch {
      // Cross-origin stylesheet, skip
    }
  }
  return tokens;
}
