# Architecture

## Workspace Layers

The npm workspace contains three reusable packages and three reference plugins:

- `@flyto2/plugin-sdk` owns JSON-RPC process dispatch and the loopback UI server.
- `@flyto2/plugin-ui-bridge` owns iframe/host messaging and result submission.
- `@flyto2/plugin-ui-tokens` owns CSS variables, utility classes, and runtime
  token injection.
- Slack demonstrates headless provider steps.
- Form Builder and Image Crop demonstrate human-in-the-loop UI steps.

## Headless Data Flow

1. Flyto2 Core starts a plugin's Node entry point with JSON-RPC over newline
   delimited stdin/stdout.
2. `handshake` reports protocol version, plugin version, registered step IDs,
   and UI metadata.
3. `invoke` maps Core context to `StepContext`, calls the registered handler,
   and returns a `StepResult` inside a JSON-RPC result.
4. `ping` reports process health; `shutdown` stops any UI server and exits.

Stdout is protocol-only. Diagnostics go to stderr.

## UI Data Flow

A UI step starts one HTTP server bound to `127.0.0.1` on an ephemeral port. The
server resolves files inside the configured UI root, injects tokens and the
bridge, and registers a cryptographically random request ID before Flyto2 Core
receives an `ui.open` notification with the local URL. Submit/cancel resolves
the matching pending request; submit, cancel, timeout, and shutdown all close
the host UI.

The request ID acts as a local callback capability. Props are safely serialized
for inline script use, static paths are confined by resolved real path, callback
bodies are capped at 10 MiB, and callback CORS accepts only the active loopback
origin. Both bridge paths require messages from the actual parent window; the
manually imported bridge can additionally enforce an exact HTTP(S) parent
origin. Its wildcard fallback is limited to trusted local pages.

## Manifest And Runtime Boundary

`plugin.yaml` is declarative discovery metadata. Runtime code registers the
same step IDs through SDK calls. Both must remain in sync. Core owns manifest
validation, process isolation, timeout enforcement, secret resolution,
authorization, tenant isolation, and browser-session policy.

## Build And Publication

TypeScript workspaces compile into ignored `dist/` build output; the bridge and
token packages copy checked source JS/CSS and declaration files into their
package output. Root gates validate all workspaces and install their actual
tarballs in a temporary consumer. Tagged releases publish six public workspaces
to npmjs.com through GitHub OIDC trusted publishing with provenance; package
publication changes external state and requires one-time trusted-publisher
configuration on every npm package.
