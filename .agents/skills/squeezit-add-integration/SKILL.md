---
name: squeezit-add-integration
description: Use when adding or substantially changing a Squeezit integration for a bundler, framework, compiler, build tool, plugin lifecycle, or package subpath export.
---

# Squeezit Add Integration

## Overview

An integration is a thin adapter over the public optimization core, never a
second optimizer. It must fit the host tool's asset lifecycle and remain a
reliable, packageable subpath export.

## Choose the lifecycle

| Host capability                                  | Pattern                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Mutable emitted assets before write              | Follow `src/integrations/rollup.ts`; update bytes, names, and references together               |
| Disk output after a successful write             | Follow `src/integrations/esbuild.ts`, `vite.ts`, or `webpack.ts`; optimize the output directory |
| Framework delegates to another supported builder | Delegate; do not clone the adapter                                                              |
| No stable asset hook                             | Do not claim a native integration; offer a documented post-build directory run                  |

Read the closest existing adapter and the host tool’s current primary API
before choosing. The in-memory path is required for content-hashed assets when
the host exposes it; a directory sweep is only correct after emitted files are
final and writable.

## Implement

1. Add `src/integrations/<tool>.ts` with narrow options such as `enabled` and
   `checkDependencies`. Keep host types type-only where possible.
2. Reuse `resolveInputs`, `optimizeImages`, dependency collection, and
   dependency diagnostics from `src/core`. Do not import CLI code or replicate
   image-format logic.
3. Make disabled mode a true no-op. Run only after a successful eligible build;
   handle no-write, missing-output, and failed-build cases explicitly.
4. Surface per-file optimization failures through the host tool in its native
   error/warning style, including file paths and messages.
5. Add the entry to `tsup.config.ts` and the conditional ESM/CJS/types subpath
   export in `package.json`. Add the host package as a peer/dev dependency only
   when the adapter needs it at runtime or for public types.
6. Document import, configuration, lifecycle, output limitations, and native
   dependency expectations in `README.md` and `docs/API.md`.

## Verify

- Add `tests/integration/<tool>.test.ts` using the real host tool and a
  representative image fixture. Compare a build with and without the adapter:
  same valid asset set, optimized image bytes lower or equal, and no unrelated
  output changes.
- Cover `enabled: false`, the host lifecycle edge cases, and missing native
  dependencies. For content-hashed output, assert filenames and generated
  references remain consistent.
- Extend `tests/unit/docs.test.ts` for documentation and public-export
  coverage where its contract applies.
- Run the focused integration test, `bun run typecheck`, `bun run test:unit`,
  `bun run build`, and `bun run check:exports`. Do not replace the real-host
  test with mocks of the host build lifecycle.

## Common mistakes

- Do not use CLI flags, spinners, prompts, or JSON envelopes in integrations.
- Do not mutate assets after a host has finalized content hashes or manifests.
- Do not omit the tsup entrypoint or package export; source-only integrations
  are broken for consumers.
- Do not advertise an unsupported experimental hook as a first-class adapter.
