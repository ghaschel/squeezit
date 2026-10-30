# Retained integration-host boundary evidence

Validation date: 2026-10-30. Implements the oldest/newest host-boundary requirement from Tasks 7–10 of the QPDF/dependency refresh plan. No public peer lower bound, adapter API, root dependency declaration, or root lockfile was changed for this validation.

## Results

The same real-host smoke runner, `tests/helpers/adapter-host-compatibility.cjs`, passed both the complete retained-floor set and the normal installed newest set in separate zero-exit invocations. Each build emits two PDFs: an eligible compressible document and a protected blank-signature-field document. The runner requires exactly two emitted PDFs, strictly smaller eligible output, and byte-identical protected output. Babel verifies accepted cache publication and absence of a protected cache artifact.

| Host    | Exact retained floor tested | Accepted newest tested | Floor result                          |
| ------- | --------------------------- | ---------------------- | ------------------------------------- |
| Babel   | 7.0.0                       | 8.0.10                 | PASS                                  |
| Astro   | 5.18.0                      | 7.4.4                  | PASS                                  |
| esbuild | 0.27.4                      | 0.28.2                 | PASS                                  |
| Gulp    | 5.0.1                       | 5.0.1                  | PASS; same version is both boundaries |
| Grunt   | 1.6.1                       | 1.6.3                  | PASS                                  |
| Parcel  | 2.16.0                      | 2.16.4                 | PASS                                  |
| Rollup  | 4.52.3                      | 4.66.0                 | PASS                                  |
| Vite    | 8.0.2                       | 8.3.5                  | PASS                                  |
| Webpack | 5.105.4                     | 5.112.2                | PASS                                  |
| Next.js | 16.2.1                      | 16.4.3                 | PASS using `next build --webpack`     |

Runtime: macOS arm64, Node 24.22.2, Bun 1.4.4, QPDF 12.4.2. The latest real-host adapter suite separately passed all 67 tests across the ten adapters before this additional boundary run. The parent implementation's final integration suite includes additional PDF safety coverage; this document records the isolated host-boundary checks specifically.

## Reproduce the isolated install

Start at the repository root after its normal frozen dependency install and build. Keep the floor project outside the repository. Its direct versions are exact; the root `package.json` and `bun.lock` remain untouched.

```sh
sqz_host_floor_dir=$(mktemp -d)
cat > "$sqz_host_floor_dir/package.json" <<'JSON'
{
  "name": "squeezit-host-floor-validation",
  "private": true,
  "dependencies": {
    "@babel/core": "7.0.0",
    "astro": "5.18.0",
    "esbuild": "0.27.4",
    "gulp": "5.0.1",
    "grunt": "1.6.1",
    "parcel": "2.16.0",
    "@parcel/core": "2.16.0",
    "@parcel/config-default": "2.16.0",
    "@parcel/transformer-raw": "2.16.0",
    "@parcel/cache": "2.16.0",
    "@parcel/fs": "2.16.0",
    "rollup": "4.52.3",
    "vite": "8.0.2",
    "webpack": "5.105.4",
    "next": "16.2.1",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  }
}
JSON
BUN_INSTALL_CACHE_DIR="$sqz_host_floor_dir/cache" bun install --cwd "$sqz_host_floor_dir"
node tests/helpers/adapter-host-compatibility.cjs "$sqz_host_floor_dir/node_modules" babel,esbuild,astro,gulp,grunt,rollup,vite,webpack,parcel,next
```

The recorded validation used an isolated temporary dependency tree, with the pinned Node 24.22.2 and Bun 1.4.4 binaries prepended to `PATH`. The isolated install resolved all exact direct targets. Bun reported two blocked postinstall scripts; all ten selected real builds nevertheless completed successfully without unblocking those scripts or modifying the main installation.

The final retained-floor command exited zero and printed:

```text
PASS Babel 7.0.0
PASS esbuild 0.27.4
PASS Astro 5.18.0
PASS gulp 5.0.1
Running "squeezit:pdf" (squeezit) task

Done.
PASS grunt 1.6.1
PASS rollup 4.52.3
PASS vite 8.0.2
PASS webpack 5.105.4
PASS parcel 2.16.0
PASS next 16.2.1
```

The optional third runner argument selects hosts. Omitting it retains the original Babel/esbuild/Astro selection so existing CI invocations are compatible. All ten can also be checked against the normal installed latest versions with:

```sh
node tests/helpers/adapter-host-compatibility.cjs "$PWD/node_modules" babel,esbuild,astro,gulp,grunt,rollup,vite,webpack,parcel,next
```

## Harness corrections exposed by the floor run

- Vite 8.0.2 initially rejected an emitted HTML path when macOS `/var` and `/private/var` aliases represented the same temporary workspace differently. The runner now canonicalizes the workspace with `realpath`; the exact Vite floor then passed. No Vite adapter behavior changed.
- Next 16.2.1 rejects `next.config.cjs`. The runner uses its supported `next.config.js` filename, matching the existing real-host integration test. The exact Next floor then passed.
- Gulp uses binary `encoding: false`. Parcel uses an isolated project boundary and matched 2.16.0 core/config/cache/fs/raw-transformer packages. Rollup exercises emitted hashed PDF assets; Vite/Webpack/esbuild/Next use their normal asset-output lifecycle; Astro covers copied public PDFs.

## Limits of this evidence

This is a real-build compatibility smoke matrix, not the full cross product of every PDF protection structure, profile, adapter option, and host version. The normal API/CLI/host suites provide broader safety and lifecycle checks. It does not claim every intermediate host release was separately tested, every host was built on Node 22.13.0, or that this local arm64 run establishes Intel/Linux behavior. The QPDF minimum/current and platform matrices are separate evidence.
