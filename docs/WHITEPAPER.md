# Flyto2 JavaScript Plugin Whitepaper

## Abstract

flyto-plugins-js defines the JavaScript and TypeScript extension boundary for
Flyto2 Core. It combines a newline-delimited JSON-RPC process SDK, a loopback
interactive UI server, a parent-window bridge, UI tokens, and reference
plugins. Its goal is to make extensions portable without transferring host
authorization or secret authority into plugin code.

## Process Contract

Core starts a plugin process and exchanges JSON-RPC handshake, invoke, ping,
and shutdown messages over stdin/stdout. Stdout is protocol-only; diagnostics
go to stderr. Runtime registration and plugin.yaml must agree on identity,
step IDs, input/output schemas, UI metadata, required secrets, and minimum Core
version.

The [SDK API](SDK_API.md) and generated
[source reference](generated/source-api.md) document every exported class,
function, type, method, and declaration. The
[plugin contract reference](generated/plugin-contracts.md) is derived from
manifests and runtime registration.

## Interactive UI Contract

UI steps start an HTTP server on 127.0.0.1 with an ephemeral port. Resolved real
paths confine static files, random request IDs act as callback capabilities,
request bodies are bounded, and CORS accepts only the active loopback origin.
Props are serialized safely before bridge injection.

The bridge accepts messages only from the parent window and can enforce an
exact HTTP(S) parent origin. Submit, cancel, timeout, and shutdown resolve or
close pending work predictably. The detailed threat boundary is maintained in
[UI_RUNTIME.md](UI_RUNTIME.md).

## Host And Plugin Responsibility

Plugins validate their inputs and outputs and should request only named
secrets. Core owns process isolation, timeouts, authorization, tenancy, secret
resolution, browser-session policy, and audit evidence. UI tokens style a
surface; they do not provide complete accessibility or product components.

## Verification And Distribution

Workspace tests exercise protocol dispatch, path confinement, injection
hardening, CORS, callbacks, reference handlers, and Python-to-Node process
integration. Contract checks compare six packages, manifests, registered
steps, versions, dependencies, and schemas. Packed tarballs are installed in a
temporary consumer before tagged npm publication through OIDC provenance.

