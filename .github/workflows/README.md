# Workflow Reference

| Workflow | Trigger | Contract |
| --- | --- | --- |
| `ci.yml` | pushes and pull requests to `main`, manual | Installs Node/Python dependencies and runs the complete `npm run verify` gate. |
| `documentation.yml` | pushes, pull requests, manual | Runs the organization documentation contract from a pinned `.github` commit. |
| `publish-npmjs.yml` | `v*` tags only | Verifies the repository, then publishes six public workspaces with npm OIDC and provenance. |
| `security.yml` | pushes and pull requests to `main`, weekly, manual | Runs pinned organization secret/dependency scanning and CycloneDX SBOM workflows. |

Do not add a duplicate build or package workflow: extend the repository's root
commands so CI, release, and local verification remain aligned.
