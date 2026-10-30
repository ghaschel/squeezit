# Optimizer upgrades and compatible dependency refresh

Status: implemented (2026-10-30).

Implement `sqz deps upgrade` using named optimizer packages. Homebrew owns their
shared dependencies and normal dependent repairs. Only missing, unverifiable, or below-target executables need remediation.
Executables at or above their bundled target are a no-op, regardless of newer
Homebrew formula revisions or shared-library releases. Preserve previews, confirmation,
structured output, receipts, pins, newer versions, and post-install verification.

Refresh the audited Rollup/AWS/browser-data lock cohort, keep Bun 1.4.4, and use
Node 26.13.0 for development/CI while retaining consumer Node >=22.13.0 and
standalone Node 24.22.2. Keep TypeScript 6.0.3 and parent-constrained dependencies.

## Execution record

- Preflight passed with isolated Bun 1.4.4. Existing feature changes are preserved.
- Continue on the existing `codex/dependency-upgrade` branch. The user subsequently authorized
  committing, pushing, and releasing after implementation.
- Task 1: target-based planning, confirmation, postchecks, tests.
- Scope correction: removed the unimplemented formula-revision upgrade tests;
  the user explicitly requires target satisfaction, not provider-latest updates.
- Task 2: audited dependency/runtime refresh and CI provisioning.
- Task 3: validation, maintenance evidence, user documentation, final review.

## Verification requirements

Run verify:agent, integration, lint/format, build, exports/types/package checks,
Node compatibility smoke checks and PDF/image preservation tests. The user
explicitly excluded max-profile testing after stopping the long serial run. Record platform checks that cannot run locally. Keep previous
scratch validation separate from verification of the final implementation.

## Progress

- Task 1: implemented target-only planning and strict executable postchecks.
  At-target/newer tools produce no commands. Preserve manager output in receipts.
- Task 2: applied the audited in-range updates, Node development/CI pins, and
  Linux libatomic prerequisite. Frozen installation preserves bun.lock.
- Additional maintenance finding: tslib 2.9.1 was released after the original
  audit; accepted within parent ranges after checking official release metadata.
- Final review: two important findings reproduced RED→GREEN: reject failed
  version probes containing version-like paths; bind provider-only Zopfli versions
  to the resolved active keg instead of the first installed receipt.
- Cross-platform validation is delegated to the existing CI matrix; no Intel
  or Linux host is connected in this session. These checks remain explicitly
  unverified, rather than inferred from local Apple Silicon tests.

See the [maintenance report](../maintenance/dependency-upgrade/README.md) for
applied versions, complete parent constraints, and validation evidence.

- Task 3: local validation passed: fast 234, CLI 84, agent 10, integration 234;
  all ten host floors, four Node runtimes, frozen install, lint/format, types,
  exports, package inspection, and advisory checks.
- The user stopped max-profile validation explicitly; the run ended with exit
  130 and is excluded from acceptance. No passing result is claimed.
- User-authorized delivery: commit, push, release, and await GitHub Actions.

- CI cost policy: automatic compatibility checks were disabled at the user's
  request; retain manual dispatch and cancel the active six-job run. Release
  delivery proceeds through the existing tag workflow.
