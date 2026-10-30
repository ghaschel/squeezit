# Squeezit documentation

Squeezit optimizes images and PDF documents through one CLI, a JS/TS API, and
ten build-tool integrations. Start with the [project README](../README.md) for
installation and common commands.

## User guides

| Guide                                        | Covers                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [API reference](API.md)                      | File and batch APIs, result types, options, and plugin configuration          |
| [PDF optimization](pdf.md)                   | Lossless compression, protected-document skips, metadata, and troubleshooting |
| [CLI automation contract](agent-contract.md) | JSON, events, reviewable plans, receipts, and safe resume                     |

## Contributor guides

| Guide                                                                               | Covers                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Agent development harness](agent-harness.md)                                       | Read-only preflight, local readiness, and test selection      |
| [Release guide](releasing.md)                                                       | Runtime pins, verification, publishing workflow, and recovery |
| [Repository instructions](https://github.com/ghaschel/squeezit/blob/main/AGENTS.md) | Required checks, documentation conventions, and commit rules  |

## Plans and maintenance records

These records live in the repository and are excluded from the npm package:

- [Provider roadmap](https://github.com/ghaschel/squeezit/blob/main/docs/plans/provider-roadmap-v1.md): proposed native, portable, and WASM providers; not an implemented API.
- [PDF implementation record](https://github.com/ghaschel/squeezit/blob/main/docs/plans/pdf-support-and-dependency-refresh.md): completed scope and remaining platform validation.
- [PDF design](https://github.com/ghaschel/squeezit/blob/main/docs/plans/pdf-support-design.md): inspection, preservation, and publication decisions.
- [Dependency refresh and validation](https://github.com/ghaschel/squeezit/blob/main/docs/maintenance/dependency-refresh/README.md): accepted versions, all dependency holds, host boundaries, and preserved audit receipts.

Current usage belongs in the topical guides above. Plans declare their status;
maintenance records date their evidence so historical results are not mistaken
for fresh checks. Links inside the repository use relative paths, and generated
audit snapshots stay separate from maintained prose.
