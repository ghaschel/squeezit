# Final dependency audit — 2026-10-30

The final `bun.lock` contains **1,476 entries, 1,320 distinct name/version pairs,
and 1,190 names**, including optional packages for other platforms. A bounded
16-worker sweep read all 2,510 exact-version/latest npm endpoints with zero
metadata failures. It rechecked engines, deprecations and parent constraints.
Three supplementary peer-metadata requests verified 18 Bun-normalized optional
wildcard peers; all explicit dependency ranges otherwise match fresh registry
metadata. No dependency installation or version change occurred during this audit.

[Complete machine inventory and individual hold reasons](evidence/2026-10-28/final-dependency-audit-2026-10-30.json)
records every resolved version, all 335 below-latest versions across 285 names,
each immediate parent and its exact dependency/optional/peer constraint, latest
version and engine policy, and all 57 direct declarations. Every below-latest
version has at least one parent constraint excluding latest. Eight also have a
broader peer that accepts latest; that peer does not override the narrower owner.
These are constraints in the verified graph, not proof that a migration is
impossible. Reconsider through parent upgrades or a separately tested migration.

Of 57 direct package names, **56 are at current npm latest**. The explicit
TypeScript 6.0.3 development compiler is held below 7.0.2 because typescript-eslint
8.72.1 requires `<6.1.0`; TypeScript 5/6 consumer support remains verified.
ATTW 0.18.5 separately pins TypeScript 5.6.1-rc for its own analysis. Other retained
prereleases are listed in the resolved inventory; they are parent-owned tools,
not substitutions for the project compiler.

Examples of runtime-reachable constraints are Oclif core 5.1.10 → EJS 6 (`^6`) and
wsl-utils 0.4 (`^0.4.0`); autocomplete 4.0.6 → EJS 3 (`^3.1.10`); Execa 10.2.1 →
pretty-ms 9.3.1 (`^9.3.1`). Latest major replacements were not forced outside
those parent ranges. The JSON register itemizes every other retained version.

Two exact versions are deprecated:

- **Glob 7.1.7** is retained by latest Grunt 1.6.3 (`~7.1.6`). Its registry notice
  marks the old Glob line unsupported. Removing it requires a Grunt/Glob owner
  migration; no compatible patch removes the old major.
- **inflight 1.0.6** is retained by that Glob 7 (`^1.0.4`). Latest inflight itself is
  deprecated and has a memory-leak notice; there is no newer package version to
  select. Remove through the parent migration.

Both paths belong to the development Grunt host graph, outside the root runtime
closure. These notices remain unresolved and visible. A deprecation notice is
separate from an npm advisory match.

A fresh Bun 1.4.4 `bun audit --json` returned **`{}`**, with zero matched packages.
The JSON records the lock SHA-256 and audit receipt. This result is a point-in-time
registry match, not a claim that the graph has no vulnerabilities. Twenty-two
packages in the complete graph exclude the consumer Node floor through their
engines; these include development tooling and platform packages. The separately
traversed installed runtime closure had 265 instances with no engine excluding
Node 22.13.0. Development Node remains 24.22.2.

Fifteen direct packages were already latest and remain unchanged at latest:
`@eslint/js`, `@parcel/core`, `@parcel/plugin`, `@types/babel__core`, `@types/gulp`,
`@types/vinyl`, `eslint-config-prettier`, `eslint-plugin-unused-imports`, `gulp`,
`husky`, `parcel`, `remark`, `remark-parse`, `remark-stringify`, and `vinyl`.
Exact versions and roles appear in the machine inventory. Moving `@parcel/plugin`
from development to runtime did not require inventing a version bump.
