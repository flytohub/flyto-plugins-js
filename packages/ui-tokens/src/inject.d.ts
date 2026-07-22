/** Apply Flyto2 CSS custom properties to an element or the document root. */
export function injectTokens(
  tokens: Record<string, string>,
  target?: HTMLElement,
): void;

/** Read declared --flyto-* custom properties from accessible stylesheets. */
export function readTokens(): Record<string, string>;
