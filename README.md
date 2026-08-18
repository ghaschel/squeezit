<p align="center">
  <img src="https://raw.githubusercontent.com/ghaschel/squeezit/main/assets/squeezit-logo.svg" alt="squeezit logo" width="80%" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ghaschel/squeezit/main/assets/squeezit-wordmark.svg" alt="Squeezit" width="440" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/v/squeezit.svg?color=0f766e&label=npm" alt="npm version" style="margin-right: 10px;"></a>
  <a href="https://www.npmjs.com/package/squeezit"><img src="https://img.shields.io/npm/dm/squeezit.svg?color=1d4ed8&label=downloads" alt="npm downloads" style="margin-right: 10px;"></a>
  <a href="https://github.com/ghaschel/squeezit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/squeezit.svg?color=334155&label=license" alt="license"></a>
</p>

`squeezit` is a CLI for aggressively compressing images without casually degrading them. It is designed for codebases, asset folders, and content repositories where you want smaller files, predictable behavior, and a command you can trust in day-to-day workflows.

It supports direct file paths, shell-style patterns like `*.png`, glob expressions like `images/**/*.webp`, and a no-argument `compress` mode that scans supported image files in the current directory. Recursive scanning is available when you ask for it.

## Why Squeezit

- Lossless-first workflow across common web and design formats
- APNG, JXL, and ICO support alongside common web asset formats
- Friendly CLI output with clear summaries, skips, and failures
- Safe threshold-based replacement so tiny wins do not churn your files
- Pattern matching that works with both regular shell parameters and glob expressions
- Works well as a local cleanup tool before commits or releases
- Published for Node users, while Bun remains the development and build toolchain

## Installation

For npm and Bun global installations, use Node.js 22.13 or later. Homebrew and
the standalone archives provide Node themselves; see their installation notes
below.

### npm

```bash
npm install -g squeezit
```

### bun

```bash
bun add -g squeezit
```

### Homebrew (macOS)

The personal tap is the easiest macOS installation because the formula installs
Node and Squeezit's native optimizer tools as dependencies:

```bash
brew install ghaschel/tap/squeezit
```

Upgrade a formula installation with Homebrew:

```bash
brew upgrade squeezit
```

Confirm the complete runtime and optimizer toolchain after installation:

```bash
sqz doctor
```

### Standalone GitHub archives

Each GitHub release includes `.tar.gz` archives for `darwin-arm64`,
`darwin-x64`, and `linux-x64`, plus a `SHA256SUMS` file. Download the archive
for your platform and `SHA256SUMS` from the same release, then verify it before
extracting it:

```bash
ARCHIVE="squeezit-v<VERSION>-<target>.tar.gz"
grep "  $ARCHIVE$" SHA256SUMS | shasum -a 256 -c -
```

Replace `<VERSION>` and `<target>` with the downloaded archive's values. On
Linux, replace `shasum -a 256 -c -` with `sha256sum --check -`. The archives
embed a Node runtime, so no separate Node installation is required; they do
**not** bundle native image optimizer tools. Install the tools for your
platform and run `sqz doctor` to see exactly what is missing before optimizing
images.

After installation, both commands are available:

```bash
squeezit --help
sqz --help
```

## Quick Start

Compress supported images in the current directory:

```bash
sqz compress
```

Preview changes without modifying files:

```bash
sqz compress --dry-run
```

Strip metadata only, without recompressing:

```bash
sqz metadata strip
```

Target only top-level PNGs:

```bash
sqz compress "*.png"
```

Target nested files with glob expressions:

```bash
sqz compress -r "images/**/*.{png,jpg,webp}"
```

Optimize an icon container in dry-run mode:

```bash
sqz compress favicon.ico --dry-run
```

Run the shorter alias:

```bash
sqz compress -r assets/**/*.jpg --dry-run
```

Check for a newer published version:

```bash
sqz update check
```

Self-update to the latest release:

```bash
sqz update apply
```

## Integrations

`squeezit` is now structured to expose first-party integrations from the same package.

Available today:

- Root JS/TS API via `import { optimizeFile, optimizeFiles, stripMetadata } from "squeezit"`
- Gulp plugin via `import { squeezitGulp } from "squeezit/gulp"`
- Grunt plugin via `const { registerSqueezitTask } = require("squeezit/grunt")`
- Vite plugin via `import { squeezitVite } from "squeezit/vite"`
- Webpack plugin via `import { squeezitWebpack } from "squeezit/webpack"`
- Rollup plugin via `import { squeezitRollup } from "squeezit/rollup"`
- Parcel optimizer plugin with implementation exported at `squeezit/parcel`
- Astro wrapper via `import { squeezitAstro } from "squeezit/astro"`
- Next.js wrapper via `import { withSqueezit } from "squeezit/next"`
- esbuild plugin via `import { squeezitEsbuild } from "squeezit/esbuild"`
- Babel plugin via `import { squeezitBabel } from "squeezit/babel"`

The supported programmatic integration surfaces are the root JS/TS API, the Gulp plugin, the Grunt plugin, the Vite plugin, the Webpack plugin, the Rollup plugin, the Parcel optimizer plugin, the Astro wrapper, the Next.js wrapper, the esbuild plugin, and the Babel plugin.

### Gulp

```js
const { src, dest } = require("gulp");
const { squeezitGulp } = require("squeezit/gulp");

exports.images = function images() {
  return src("assets/**/*").pipe(squeezitGulp()).pipe(dest("dist/assets"));
};
```

The Gulp plugin runs as a Vinyl transform, uses the default compression strategy, and always enables metadata stripping. It supports buffered Vinyl files, stream-backed Vinyl files by buffering them internally before optimization, and path-backed null Vinyl files when `file.path` is available. Null Vinyl files without a usable path pass through unchanged. It does not expose or use `max` mode.

### Grunt

```js
const { registerSqueezitTask } = require("squeezit/grunt");

module.exports = function (grunt) {
  registerSqueezitTask(grunt);

  grunt.initConfig({
    squeezit: {
      images: {
        files: [
          {
            src: ["assets/**/*.{png,jpg,webp,svg}"],
            dest: "dist/assets",
          },
        ],
      },
    },
  });
};
```

The Grunt plugin registers a real multi-task, uses the default compression strategy, and always enables metadata stripping. v1 respects Grunt file mappings, so it can optimize files in place or write optimized output to mapped destination paths. It does not expose or use `max` mode.

### Vite

```ts
import { defineConfig } from "vite";
import { squeezitVite } from "squeezit/vite";

export default defineConfig({
  plugins: [squeezitVite()],
});
```

The Vite plugin runs only for production builds, optimizes emitted assets from the output directory, uses the default compression strategy, and always enables metadata stripping. It does not expose or use `max` mode.

### Webpack

```ts
const { squeezitWebpack } = require("squeezit/webpack");

module.exports = {
  plugins: [squeezitWebpack()],
};
```

The Webpack plugin runs after assets are written to the configured output directory, optimizes emitted image files from that directory, uses the default compression strategy, and always enables metadata stripping. It does not expose or use `max` mode.

### Rollup

```ts
import { defineConfig } from "rollup";
import { squeezitRollup } from "squeezit/rollup";

export default defineConfig({
  input: "src/index.js",
  output: {
    dir: "dist",
    format: "esm",
  },
  plugins: [squeezitRollup()],
});
```

The Rollup plugin optimizes emitted image assets with the default compression strategy and always enables metadata stripping. It prefers in-memory asset optimization during bundle generation, including hash-safe filename/reference updates when asset bytes change, and uses a post-write output pass as a fallback for emitted files not already handled in memory. It does not expose or use `max` mode.

### Parcel

`squeezit/parcel` exports the Parcel optimizer implementation, but Parcel itself only accepts optimizer specifiers that match its `parcel-optimizer-*` naming convention. When consuming it from the main `squeezit` package, point `.parcelrc` at the built plugin file inside `node_modules`:

`.parcelrc`

```json
{
  "extends": "@parcel/config-default",
  "transformers": {
    "url:*": ["@parcel/transformer-raw"]
  },
  "optimizers": {
    "*.{png,gif,webp,svg,heif,heic,avif,bmp,ico,cur,jxl}": [
      "...",
      "./node_modules/squeezit/dist/parcel.cjs"
    ]
  }
}
```

`package.json`

```json
{
  "squeezit": {
    "parcel": {
      "enabled": true,
      "checkDependencies": true,
      "productionOnly": true
    }
  }
}
```

The Parcel integration is a real Parcel optimizer plugin. It runs in Parcel's asset pipeline, uses the default compression strategy, always enables metadata stripping, and is production-only by default. Its small config surface is read from `package.json` under `squeezit.parcel`, and it does not expose or use `max` mode.

### Astro

```ts
import { defineConfig } from "astro/config";
import { squeezitAstro } from "squeezit/astro";

export default defineConfig({
  output: "static",
  integrations: [squeezitAstro()],
});
```

The Astro wrapper is a thin integration over `squeezit/vite`. It only matters for `astro build`, targets static Astro output in v1, uses the default compression strategy, and always enables metadata stripping. SSR and hybrid Astro output are not supported by this wrapper yet, and it does not expose or use `max` mode.

### Next.js

```js
const { withSqueezit } = require("squeezit/next");

module.exports = withSqueezit({
  webpack(config) {
    return config;
  },
});
```

The Next.js wrapper augments webpack-based Next builds by injecting the `squeezit` Webpack plugin through `next.config.js`/`next.config.ts`. It uses the default compression strategy, always enables metadata stripping, and does not expose or use `max` mode.

Turbopack support is not included in this wrapper yet. It is planned and coming soon, but this integration currently targets Next’s webpack build pipeline only.

### esbuild

```ts
import { build } from "esbuild";
import { squeezitEsbuild } from "squeezit/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  bundle: true,
  plugins: [squeezitEsbuild()],
});
```

The esbuild plugin runs after a successful disk-backed build, optimizes emitted image files from the written output directory, uses the default compression strategy, and always enables metadata stripping. It does not expose or use `max` mode.

### Babel

```ts
import { squeezitBabel } from "squeezit/babel";

export default {
  plugins: [[squeezitBabel, { productionOnly: true }]],
};
```

The Babel plugin is narrower than the emitted-asset integrations. It runs at compile time, is production-only by default, rewrites static local image imports and static JSX string-literal asset references, and writes optimized generated copies under `.squeezit/babel-assets`. It does not mutate source assets and does not expose or use `max` mode.

The fixture-value helper and JS/TS API report `filePath` and `outputPath` relative to the effective `cwd`, not as absolute machine-specific paths.

## Documentation

- [API reference](https://github.com/ghaschel/squeezit/blob/main/docs/API.md)
- [Agent-ready CLI contract](https://github.com/ghaschel/squeezit/blob/main/docs/agent-contract.md)
- [Release and maintainer guide](https://github.com/ghaschel/squeezit/blob/main/docs/releasing.md)

### Usage

```bash
sqz <command> [arguments] [flags]
```

### Commands

| Command                                                       | Purpose                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `sqz compress [patterns...]`                                  | Optimize images. `--profile standard \| max` selects the strategy. |
| `sqz metadata strip [patterns...]`                            | Remove metadata without recompression. `sqz exif` is its alias.    |
| `sqz plan compress [patterns...] --output <plan.json>`        | Create a reviewable compression plan without writing images.       |
| `sqz plan metadata strip [patterns...] --output <plan.json>`  | Create a metadata-removal plan. `sqz plan exif` is its alias.      |
| `sqz plan apply <plan.json> --yes`                            | Revalidate and apply exactly one reviewed plan.                    |
| `sqz receipt resume <receipt.json> --output <new.json> --yes` | Retry only safe, unfinished image work in a new linked receipt.    |
| `sqz deps doctor [patterns...]`                               | Check all tools, or only the tools required by selected inputs.    |
| `sqz deps install [patterns...]`                              | Install missing tools for all formats or selected inputs.          |
| `sqz doctor`                                                  | Check Node, platform, update source, and the complete toolchain.   |
| `sqz update check` / `sqz update apply`                       | Check or apply a global update.                                    |
| `sqz capabilities --json`                                     | Discover commands, flags, side effects, and JSON schemas.          |
| `sqz commands`, `sqz help [command]`, `sqz version`           | Discover the installed CLI.                                        |

`sqz` is the canonical binary; `squeezit` remains a full alias. `sqz` with no command shows help.

### Compression flags

| Flag                        | Description                                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--profile standard \| max` | `max` preserves the former full/max behavior: heaviest lossless passes, metadata removal, threshold `0`, and a default concurrency cap of `2`. It cannot be combined with `--threshold`. |
| `-r, --recursive`           | Recurse into input directories.                                                                                                                                                          |
| `-s, --strip-meta`          | Remove EXIF, IPTC, and XMP metadata during compression.                                                                                                                                  |
| `-d, --dry-run`             | Report potential changes without writing files.                                                                                                                                          |
| `-k, --keep-time`           | Preserve input timestamps.                                                                                                                                                               |
| `-c, --concurrency <n>`     | Set worker count.                                                                                                                                                                        |
| `--progress auto \| off`    | Use TTY progress automatically or force streaming output.                                                                                                                                |
| `-t, --threshold <bytes>`   | Minimum bytes saved before replacement; invalid with `--profile max`.                                                                                                                    |
| `-i, --in-place`            | Create temporary artifacts beside source files.                                                                                                                                          |
| `-y, --yes`                 | Confirm non-dry-run image changes without an interactive prompt. Required in JSON, JSON Lines, or non-interactive mode.                                                                  |
| `-v, --verbose`             | Print diagnostics to stderr, or include them in JSON output.                                                                                                                             |
| `--receipt <path>`          | Atomically checkpoint an auditable receipt for an operational command.                                                                                                                   |

Patterns can be explicit paths, directories, shell patterns, or glob expressions. A `compress` command with no patterns scans supported image extensions in the current directory; scanning is non-recursive unless `--recursive` is supplied.

### Progress Output

With the default `--progress auto`, Squeezit shows a transient concurrent task list in supported interactive terminals. When every file has finished, it clears that live view and prints the usual durable per-file report in discovery order, followed by the summary.

The interactive view is enabled only when stdout is a TTY, `TERM` is not `dumb`, and `CI` is unset. In CI, redirected output, and unsupported terminals, Squeezit keeps the existing streaming result lines as each file finishes. Use `--progress off` to choose that streaming output explicitly.

`--events jsonl` is a machine-output mode, so it always suppresses the TTY
renderer and prose output. It writes structured progress records instead; see
[JSON and automation](#json-and-automation).

### Reviewable plan and apply workflow

For automation that needs an explicit review boundary, create a plan before
modifying files:

```bash
sqz plan compress "assets/**/*.{png,jpg}" --output .squeezit/plans/assets.json
sqz plan apply .squeezit/plans/assets.json --yes
```

`plan compress` and `plan metadata strip` resolve files with the normal
discovery rules, hash each source with SHA-256, record semantic optimization
options, and snapshot the healthy native tools required for those inputs. They
do not compress images or estimate savings. The artifact is written atomically;
an existing `--output` path is never overwritten.

`plan apply` accepts no optimization overrides. It always requires `--yes`,
including in an interactive terminal, then verifies the artifact digest,
Squeezit version, platform, tool provider/version, and every source fingerprint
before any optimizer starts. It checks each input again immediately before
creating a working copy and before replacement, so a source changed during the
batch is reported instead of being overwritten. The apply run uses the normal
TTY progress and non-TTY streaming behavior.

### Run receipts and safe resume

Add `--receipt <path>` to an operational command when its options, runtime,
native-tool diagnostics, input hashes, per-input results, outputs, and elapsed
time must remain auditable after the process exits. Squeezit creates the path
atomically, continuously replaces it with a complete checkpoint, and refuses
to overwrite an existing artifact. The final human report prints the receipt
path; final JSON and JSON Lines terminal data include its ID, digest, status,
and absolute path.

```bash
sqz compress "assets/**/*.{png,jpg}" --dry-run \
  --receipt .squeezit/receipts/assets-preview.json
```

Interrupted or failed `compress`, `metadata strip`, and `plan apply` jobs can
be retried without touching their source receipt:

```bash
sqz receipt resume .squeezit/receipts/assets.json \
  --output .squeezit/receipts/assets-retry.json --yes
```

Resume never accepts optimization overrides. It retries only inputs still
`pending`, `running`, or `failed`; it verifies the active Squeezit
version/platform, required optimizer provider/version, and every retry input's
original SHA-256/size before any optimizer starts. A failed input is eligible
only when the receipt proves the failure did not alter it.

### Examples

Preview everything under the current directory:

```bash
sqz compress --dry-run
```

Compress a single file:

```bash
sqz compress ./images/cover.png
```

Compress every JPEG under `assets`, but only if the win is at least 1 KB:

```bash
sqz compress -r "assets/**/*.jpg" --threshold 1024
```

Use the heaviest compression strategy:

```bash
sqz compress -r "images/**/*" --profile max
```

Strip metadata only:

```bash
sqz metadata strip "photos/**/*.{jpg,tiff,heic}"
```

Preserve timestamps while stripping metadata:

```bash
sqz compress -r "photos/**/*.{jpg,tiff,heic}" --strip-meta --keep-time
```

Dry-run a JPEG XL file:

```bash
sqz compress artwork.jxl --dry-run
```

Use durable streaming output even in an interactive terminal:

```bash
sqz compress --progress off "images/**/*.{png,jpg,webp}"
```

Modernize an ICO while preserving its icon sizes:

```bash
sqz compress app.ico
```

Modernize a cursor container while preserving entry sizes and hotspots:

```bash
sqz compress pointer.cur
```

Update the global installation explicitly with npm:

```bash
sqz update apply --pm npm
```

## Supported Inputs

Squeezit currently matches these file extensions during discovery:

- `jpg`, `jpeg`
- `png`, `apng`
- `gif`
- `webp`
- `svg`
- `tif`, `tiff`
- `heic`, `heif`
- `avif`
- `bmp`
- `jxl`
- `ico`, `cur`
- `cr2`, `nef`, `arw`, `raf`, `orf`, `rw2`

Internally, compression behavior is determined with MIME detection where applicable, not only by extension.

## Supported Formats

Squeezit currently supports these image format families:

- `JPEG` (`.jpg`, `.jpeg`): fast lossless optimization by default, heavier passes with `--profile max`
- `PNG` (`.png`): fast `oxipng` optimization by default, heavier candidate comparison with `--profile max`
- `APNG` (`.apng`, animated PNG payloads): optimized losslessly with `oxipng`
- `GIF` (`.gif`): fast lossless optimization by default, strongest `gifsicle` pass with `--profile max`
- `WebP` (`.webp`): lossless re-encode, with heavier encoder settings with `--profile max`, including animated WebP handling
- `SVG` (`.svg`): single-pass optimization by default, multipass with `--profile max`
- `TIFF` (`.tif`, `.tiff`): lossless ZIP recompression, with a heavier ZIP preset with `--profile max`
- `HEIF / HEIC` (`.heif`, `.heic`): lossless re-encode, with a slower encoder preset with `--profile max`
- `AVIF` (`.avif`): lossless re-encode, with a slower encoder speed with `--profile max`
- `BMP` (`.bmp`): lossless RLE recompression for source 4-bit and 8-bit BMPs only; higher-bit BMPs are skipped
- `JPEG XL` (`.jxl`): lossless re-encode, with a faster default pass and multi-effort candidate comparison with `--profile max`
- `ICO` (`.ico`): modernized by extracting embedded icon images, optimizing them, and rebuilding the icon container while preserving the original entry dimensions; if the rebuilt icon changes the dimension set, it is skipped
- `CUR` (`.cur`): modernized by extracting embedded cursor images, optimizing them, and rebuilding the cursor container while preserving the original entry dimensions and hotspot coordinates; if the rebuilt cursor changes either, it is skipped
- `RAW camera files` (`.cr2`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`): metadata stripping with `sqz metadata strip`, optional RAW-to-DNG conversion with `sqz compress --profile max` using the smallest lossless DNG settings

Notes:

- If a lossless result is larger, the file is skipped and never replaced
- `sqz metadata strip` is metadata-only and does not run recompression pipelines
- `--profile max` always strips metadata in addition to raising encoder effort across the supported recompression pipelines
- `--profile max` forces the replacement threshold to `0`, so any positive lossless reduction is accepted
- JPEG standard mode uses one lossless MozJPEG pass; JPEG max mode also runs JPEGoptim from the original input and keeps the smaller result, trading additional CPU time for that comparison
- ICO support is focused on modernizing containers while preserving icon sizes, not preserving original legacy BMP-style encoding byte-for-byte
- CUR support is focused on modernizing containers while preserving entry sizes and cursor hotspots, not preserving original legacy BMP-style encoding byte-for-byte
- BMP metadata-only writing is not supported; BMP optimization only rewrites eligible indexed BMP image data
- ICO and CUR metadata-only writing are not supported
- RAW files are special-case inputs and only convert to `.dng` with `--profile max`
- RAW `--profile max` conversion targets the smallest lossless DNG by disabling embedded RAW, preview, and thumbnail payloads; `.rw2` inputs also try the available lossless JPEG predictor variants and keep the smallest result

## System Dependencies

Squeezit orchestrates native image tools based on the inputs you actually process. It may require binaries such as:

- `file`
- MozJPEG's `jpegtran`; `jpegoptim` for the additional `--profile max` candidate
- `pngcrush`, `optipng`, `zopflipng`, `oxipng`
- `gifsicle`
- `svgo`
- `cwebp`, `dwebp`, `webpinfo`, `webpmux`
- `heif-enc`
- `avifenc`
- `tiffcp`
- `magick`
- `exiftool`
- `cjxl`
- `icotool`
- `dnglab` for RAW to DNG conversion with `--profile max`

Not every run needs every tool. `sqz deps doctor [patterns...]` is format-aware; without patterns it checks the full supported toolchain. `sqz doctor` also checks Node 22.13+, the current platform, and update readiness.

The doctor enforces minimum tool versions, including MozJPEG 4.1.5, `jpegoptim` 1.5.6, `oxipng` 10.1.0, `svgo` 4.0.1, WebP tools 1.6.0, ImageMagick 7.1.2-9, ExifTool 13.50, and the approved versions of every remaining optimizer. It reports the executable version, provider, health, and a remediation. macOS supplies `file` itself; Homebrew supplies MozJPEG through its keg-only `mozjpeg` formula, which Squeezit resolves automatically.

Install missing tools explicitly:

```bash
sqz deps install
sqz deps install "images/**/*.{png,jpg}"
```

`deps install` and `update apply` prompt in an interactive terminal. They require `--yes` in JSON, JSON Lines, or non-interactive environments; piping an affirmative response is intentionally unsupported.

On Debian/Ubuntu, Squeezit uses APT for supported packages and Cargo for `oxipng` 10.1.0, which Ubuntu does not provide as a suitable APT package. Install Rust/Cargo first if it is not already available. Debian/Ubuntu does not provide a supported MozJPEG package: install MozJPEG yourself and point `SQUEEZIT_MOZJPEGTRAN` at its `jpegtran` executable. Squeezit intentionally does not substitute `jpeg-turbo` for MozJPEG.

## Self-Update

Squeezit can check for a new published version and update itself without conflating the read-only and state-changing operations:

```bash
sqz update check
sqz update apply
```

Installer detection works like this:

- `update check` never writes installer state.
- A successful `update apply` records the npm, Bun, or Homebrew source used.
- Homebrew is valid only when the active installation is formula-managed; it
  does not install the Homebrew formula for an npm-, Bun-, or archive-installed
  CLI.
- If detection is ambiguous, choose `--pm npm`, `--pm bun`, or `--pm brew`.

Examples:

```bash
sqz update apply --pm npm
sqz update apply --pm bun
sqz update apply --pm brew --yes
```

### JSON and automation

Every Squeezit-owned operational/display command accepts `--json` and writes exactly one version-2 JSON document to stdout. It includes the installation and runtime provenance that produced the result:

```json
{
  "schemaVersion": 2,
  "command": "deps doctor",
  "ok": true,
  "data": {},
  "meta": {
    "squeezitVersion": "2.0.7",
    "invocationPath": "/path/to/bin/sqz",
    "executablePath": "/path/to/squeezit/bin/run.js",
    "packageRoot": "/path/to/squeezit",
    "nodeVersion": "24.16.0",
    "cwd": "/path/to/project",
    "platform": "darwin-arm64"
  }
}
```

Expected unhealthy states set `ok` to `false` and exit with code `1`. Failures include `error.code`, `error.message`, `error.remediation`, and optional structured `error.details`, so automation can branch on stable semantics rather than text. Human diagnostics go to stderr with `--verbose`; JSON places them in `data.diagnostics`.

For a large job that an orchestrator must observe while it runs, use the
separate JSON Lines transport instead:

```bash
sqz compress "images/**/*.{png,jpg}" --dry-run --events jsonl
```

Each stdout line is a JSON event. `command.started` is first and contains the
same runtime provenance as `--json`; phase and per-file events follow as work
progresses; exactly one `command.completed` or `command.failed` record ends the
run. All records share a UUID `runId` and monotonically increasing `sequence`.
The terminal record has the same `ok`, `data`, and typed `error` semantics as
the final JSON envelope. JSON Lines never emits spinners or prose, and it is
mutually exclusive with `--json`.

Start an automated integration with `sqz capabilities --json`: it reports every command, alias, argument, flag/default/enum, side effect, confirmation policy, JSON Lines lifecycle, and output-schema reference. `sqz doctor --json` also detects stale or shadowed Squeezit binaries on `PATH`; these installation warnings remain visible without making runtime/tool readiness unhealthy. The complete contract, error-code reference, and schema locations are in the [agent-ready CLI contract](https://github.com/ghaschel/squeezit/blob/main/docs/agent-contract.md). The upstream `sqz autocomplete` command is the only intentional exception to this JSON contract.

The same capability response reports the version-pinned local and unpkg
locations of `schemas/optimization-plan-v1.schema.json`,
`schemas/command-events-v1.schema.json`, and
`schemas/run-receipt-v1.schema.json`. Agents can create a plan, review its
digest/input/tool snapshot, and invoke `sqz plan apply <plan.json> --yes` only
when the reviewed plan remains valid. They can also persist the execution
record with `--receipt` and use `sqz receipt resume` for safe retry-only work.

### Shell completion

Install the completion integration for your shell:

```bash
sqz autocomplete zsh
sqz autocomplete bash
sqz autocomplete powershell
```

The completion command exposes Squeezit commands, both binary aliases, flags, and enumerated values such as `--profile max`.

## Migrating to 2.0

2.0 intentionally replaces the root compression command and its operational flags. Use explicit commands instead:

| Before 2.0               | 2.0                          |
| ------------------------ | ---------------------------- |
| `squeezit [patterns...]` | `sqz compress [patterns...]` |
| `--max`                  | `compress --profile max`     |
| `--exif`                 | `metadata strip` or `exif`   |
| `--install-deps`         | `deps install`               |
| `--check-update`         | `update check`               |
| `--update`               | `update apply`               |

Supported operating systems for tool installation are:

- macOS via Homebrew
- Debian/Ubuntu via APT

## Development

This project publishes a Node-targeted CLI, but uses Bun for local development.

Install dependencies:

```bash
bun install
```

Build the published artifact:

```bash
bun run build
```

Run the compiled CLI locally:

```bash
node ./bin/run.js --help
```

Use the test lanes that match the change:

```bash
bun run verify:agent # Default for coding agents: no real image compression.
bun test             # Fast + CLI + non-slow integration coverage.
bun run test:slow    # Real max-profile compression; run only when requested.
bun run test:all     # Every lane, including slow max-profile compression.
```

| Command                    | Use it for                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `bun run test:fast`        | Fast unit feedback without compiled CLI checks or real image compression.                 |
| `bun run test:cli`         | Compiled CLI, Oclif manifest, JSON/event/plan/receipt contracts.                          |
| `bun run test:integration` | Standard/exif API and bundler integration coverage.                                       |
| `bun run test:slow`        | Real `--profile max` fixture compression, serially.                                       |
| `bun run verify:agent`     | The agent default: typecheck, fast tests, CLI contracts, exports, and package inspection. |

`bun test` deliberately excludes the slow lane. Run `test:slow` only when a
change affects max compression or when explicitly requested.

## License

[MIT](https://github.com/ghaschel/squeezit/blob/main/LICENSE)
