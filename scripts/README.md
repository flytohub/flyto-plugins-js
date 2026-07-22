# Repository Scripts

- `generate-reference.mjs` derives source/API, plugin-manifest, and UI-token
  references. Use `npm run docs:generate` after changing a contract; CI uses
  `npm run docs` to reject stale output.
- `check-workspace-contracts.mjs` checks all six package identities, versions,
  publication settings, and manifest-to-TypeScript registration parity.
- `check-package-contents.mjs` builds real npm tarballs, rejects missing or
  unintended files, installs the SDK/bridge/tokens into a temporary project,
  and requests the packaged virtual UI assets.

All scripts are local and deterministic except the temporary `npm install`
performed by the package smoke test.
