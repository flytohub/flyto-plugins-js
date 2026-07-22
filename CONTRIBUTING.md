# Contributing

Read `PROJECT.md`, `ARCHITECTURE.md`, `STATE.md`, and `DECISIONS.md` before
changing SDK contracts, plugin manifests, package publishing, or public docs.

Use flyto-indexer `search` and `impact` or `task(action='plan')` before editing.
Before opening a PR, run:

```bash
npm ci
npm run verify
```

When a public declaration, embedded UI helper, plugin manifest, or CSS token
changes, regenerate references first:

```bash
npm run docs:generate
npm run verify
```

Do not edit `docs/generated/*` by hand. A reference-plugin change must keep
package and manifest versions, runtime identity, registration, schemas, tests,
and tarball contents aligned. Publishing follows
[`docs/RELEASE.md`](docs/RELEASE.md).

Security issues go to `security@flyto2.com`.
