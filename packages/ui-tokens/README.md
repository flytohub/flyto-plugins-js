# @flyto/plugin-ui-tokens

CSS design tokens for Flyto2 plugin UIs. Import this package to match the flyto-cloud dark theme.

## Usage

### In HTML (auto-injected by SDK)

When using `@flyto/plugin-sdk` with a UI step, tokens are automatically injected into your HTML. Just use the CSS variables:

```css
.my-button {
  background: var(--flyto-primary);
  color: var(--flyto-text-primary);
  border-radius: var(--flyto-radius-lg);
  padding: var(--flyto-space-2) var(--flyto-space-4);
}
```

### Manual Import

```html
<link rel="stylesheet" href="@flyto/plugin-ui-tokens">
```

```css
@import '@flyto/plugin-ui-tokens';
```

## Tokens

### Colors

| Token | Value | Usage |
|---|---|---|
| `--flyto-primary` | `#8b5cf6` | Primary brand color |
| `--flyto-primary-light` | `#a78bfa` | Hover/focus states |
| `--flyto-accent` | `#06b6d4` | Secondary accent |
| `--flyto-success` | `#10b981` | Success states |
| `--flyto-warning` | `#f59e0b` | Warning states |
| `--flyto-error` | `#ef4444` | Error states |

### Surfaces

| Token | Value | Usage |
|---|---|---|
| `--flyto-bg-page` | `#0f172a` | Page background |
| `--flyto-bg-card` | `rgba(30,41,59,0.8)` | Card background |
| `--flyto-bg-input` | `#1e293b` | Input background |
| `--flyto-border` | `rgba(148,163,184,0.1)` | Default border |

### Typography

| Token | Value |
|---|---|
| `--flyto-text-sm` | `0.875rem` (14px) |
| `--flyto-text-base` | `1rem` (16px) |
| `--flyto-font-medium` | `500` |
| `--flyto-font-semibold` | `600` |

### Spacing

`--flyto-space-1` through `--flyto-space-12` (4px to 48px).

### Radius

`--flyto-radius-sm` (4px) through `--flyto-radius-full` (9999px).

## Utility Classes

Pre-built component classes: `.flyto-btn`, `.flyto-btn-primary`, `.flyto-btn-secondary`, `.flyto-input`, `.flyto-card`, `.flyto-label`.
