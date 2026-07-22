# npm Release Runbook

## Published Workspaces

The repository publishes six public packages to npmjs.com:

- `@flyto2/plugin-sdk`
- `@flyto2/plugin-ui-bridge`
- `@flyto2/plugin-ui-tokens`
- `@flyto2/plugin-form-builder`
- `@flyto2/plugin-image-crop`
- `@flyto2/plugin-slack`

GitHub Packages is not a publication target. Every package declares the npmjs
registry and public access in `publishConfig`.

## One-Time npm Configuration

On each package's npm settings page, add a GitHub Actions trusted publisher with
organization `flytohub`, repository `flyto-plugins-js`, and workflow filename
`publish-npmjs.yml`. The workflow uses `id-token: write`; no `NPM_TOKEN` is
needed. After one successful OIDC publication, revoke obsolete npm automation
tokens and remove unused repository secrets.

Trusted publisher configuration is external state and cannot be proven by this
repository. A missing or mismatched package publisher causes npm to reject the
publish job without changing package contents.

## Version And Tag Contract

All six package versions move together. The three plugin package versions must
also equal their `plugin.yaml` versions and `createPlugin()` runtime versions.
`npm run contracts` rejects drift and requires a `vX.Y.Z` release tag to equal
the workspace version while running on a tag.

The repository already has a historical `v0.1.1` Git tag, while npm currently
contains version `0.1.0`. Do not delete, move, or reuse that tag. The next public
release must therefore be `0.1.2` or newer across every package, manifest, and
runtime registration.

## Release Procedure

1. Update all six package versions and all three manifest/runtime versions.
2. Update `CHANGELOG.md`, regenerate references, and run `npm run verify` from a
   clean checkout.
3. Inspect `npm pack --json --workspaces` output and confirm no source tests,
   fixtures, credentials, or unrelated files are present.
4. Commit and push `main`, then create and push the matching signed `vX.Y.Z`
   tag.
5. Confirm the publish workflow passed and each npm package shows provenance.

npm publication is immutable external state. If one package publishes and a
later workspace fails, fix forward with a newer patch version; never overwrite
or unpublish an established version as a normal rollback mechanism.
