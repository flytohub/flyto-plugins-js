# State

Current state on 2026-08-14:

- Governed coding jobs install the pinned workspace dependency graph and run
  the complete build, test, documentation, package, security, and strict
  Indexer gate through `.flyto/coding.yaml` before independent Codex audit.

- Repo status: active
- Product lines: cloud_apps_automation, data, zero_person_agent
- Health target: B
- Public SDK, UI server, bridge, token, manifest, and five reference-step
  contracts are mapped to source and tests.
- Generated references cover 111 named source declarations, five plugin steps,
  78 CSS tokens, and eight utility classes.
- UI runtime hardens JSON-RPC envelopes, props serialization, real-path static
  confinement, callback capabilities, exact loopback CORS, body limits, and
  parent-message source/origin handling.
- Six public workspaces target npmjs.com and are packed and installed in a
  temporary consumer by the release gate.
- CI uses Node 24, Python 3.11, and a pinned Flyto2 Indexer commit. npm release
  uses GitHub OIDC trusted publishing and provenance without a repository
  `NPM_TOKEN`.

Known external or follow-up work:

- Trusted publisher configuration must exist on each of the six npm package
  pages before the first tokenless release.
- A historical `v0.1.1` Git tag exists while npm packages remain at `0.1.0`;
  the next release must use package version and tag `0.1.2` or newer.
- Host policy remains responsible for approval identity/evidence, external
  image network allowlists, secret isolation, authorization, and tenancy.
- Custom Form Builder controls and Image Crop manipulation need a dedicated
  keyboard and automated accessibility pass before claiming full WCAG support.

Last local verification on 2026-07-22:

- `npm run verify`: passed from clean output; 57 Node tests, 17 Python process
  scenarios, six tarball audits/install smoke tests, and Flyto2 Indexer 17/17.
- Documentation: README 100, overall 100, API/module/inline coverage 100%, no
  manifest errors or warnings across four source areas and nine features.
- Supply chain: zero production dependency vulnerabilities; Apache-2.0 detected,
  no unlicensed dependencies, and no copyleft warning.
- Repository: no retired standalone product naming or unsupported email findings, no diff whitespace
  errors, and local `main` had zero divergence from `origin/main` before commit.
