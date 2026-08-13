# Graph Report - . (2026-08-10)

## Corpus Check

- Large corpus: 151 files · ~594,410 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary

- 883 nodes · 1622 edges · 46 communities (40 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- [[_COMMUNITY_Optimization Engine|Optimization Engine]]
- [[_COMMUNITY_Dependency Management|Dependency Management]]
- [[_COMMUNITY_CLI Commands|CLI Commands]]
- [[_COMMUNITY_Astro Integration Tests|Astro Integration Tests]]
- [[_COMMUNITY_Development Tooling|Development Tooling]]
- [[_COMMUNITY_Product Changelog|Product Changelog]]
- [[_COMMUNITY_Module Exports|Module Exports]]
- [[_COMMUNITY_Early Releases|Early Releases]]
- [[_COMMUNITY_Programmatic API|Programmatic API]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_Gulp Integration Tests|Gulp Integration Tests]]
- [[_COMMUNITY_API Option Normalization|API Option Normalization]]
- [[_COMMUNITY_Test Workspaces|Test Workspaces]]
- [[_COMMUNITY_Optional Peers|Optional Peers]]
- [[_COMMUNITY_Rollup Integration Tests|Rollup Integration Tests]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Parcel Integration Tests|Parcel Integration Tests]]
- [[_COMMUNITY_Babel Asset Transformation|Babel Asset Transformation]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Changelog Tooling|Changelog Tooling]]
- [[_COMMUNITY_Next Integration Tests|Next Integration Tests]]
- [[_COMMUNITY_esbuild Integration Tests|esbuild Integration Tests]]
- [[_COMMUNITY_Grunt Integration Tests|Grunt Integration Tests]]
- [[_COMMUNITY_Vite Integration Tests|Vite Integration Tests]]
- [[_COMMUNITY_Webpack Integration Tests|Webpack Integration Tests]]
- [[_COMMUNITY_Peer Dependencies|Peer Dependencies]]
- [[_COMMUNITY_Fixture Definitions|Fixture Definitions]]
- [[_COMMUNITY_Babel Integration Tests|Babel Integration Tests]]
- [[_COMMUNITY_CLI Tests|CLI Tests]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Release Preparation|Release Preparation]]
- [[_COMMUNITY_Commit Message Rules|Commit Message Rules]]
- [[_COMMUNITY_Install Configuration|Install Configuration]]
- [[_COMMUNITY_CLI Binaries|CLI Binaries]]
- [[_COMMUNITY_Config Metadata|Config Metadata]]
- [[_COMMUNITY_Repository Metadata|Repository Metadata]]
- [[_COMMUNITY_Fixture Value Workflow|Fixture Value Workflow]]
- [[_COMMUNITY_Integration Placeholder|Integration Placeholder]]
- [[_COMMUNITY_Lint Staged Rules|Lint Staged Rules]]
- [[_COMMUNITY_Vendor Type Shims|Vendor Type Shims]]
- [[_COMMUNITY_Webpack Wrapper|Webpack Wrapper]]
- [[_COMMUNITY_Git Hooks|Git Hooks]]
- [[_COMMUNITY_Test Configuration|Test Configuration]]

## God Nodes (most connected - your core abstractions)

1. `scripts` - 30 edges
2. `runCheckedCommand()` - 29 edges
3. `defineApiFormatTests()` - 23 edges
4. `hasRepresentativeFixture()` - 21 edges
5. `createTempWorkspace()` - 21 edges
6. `resolveInputs()` - 21 edges
7. `compilerOptions` - 19 edges
8. `optimizeImages()` - 18 edges
9. `collectRequiredDependencies()` - 17 edges
10. `findMissingDependencies()` - 16 edges

## Surprising Connections (you probably didn't know these)

- `Lossless Safety Policy` --semantically_similar_to--> `Lossless-First Workflow` [INFERRED] [semantically similar]
  docs/plans/provider-roadmap-v1.md → README.md
- `parseCli()` --calls--> `createCli()` [EXTRACTED]
  tests/unit/cli.test.ts → src/cli/index.ts
- `FormatFixture` --references--> `ApiOptimizationMode` [EXTRACTED]
  tests/helpers/fixture-manifest.ts → src/types/api.ts
- `Squeezit` --references--> `optimizeFiles` [EXTRACTED]
  README.md → docs/API.md
- `Squeezit` --references--> `stripMetadata` [EXTRACTED]
  README.md → docs/API.md

## Communities (46 total, 6 thin omitted)

### Community 0 - "Optimization Engine"

Cohesion: 0.05
Nodes (89): asset, binaries, dependencies, header, info, options, parsed, commandExists() (+81 more)

### Community 1 - "Dependency Management"

Cohesion: 0.06
Nodes (68): assertDependencies(), BufferAsset, createBufferAsset(), createFileAsset(), FileAsset, OptimizationAsset, optimizeAsset(), OptimizedAssetResult (+60 more)

### Community 2 - "CLI Commands"

Cohesion: 0.08
Nodes (41): runCompressCommand(), handleUpdateFlags(), CompressCliFlags, CompressCommandOptions, CoreBatchOptions, CoreInputResolutionOptions, InstallerConfig, PackageManager (+33 more)

### Community 3 - "Astro Integration Tests"

Cohesion: 0.05
Nodes (42): astroFixtureKeys, buildAstroConfigSource(), buildPageSource(), buildProject(), createWorkspace(), fixtures, getAstroFixtures(), integration (+34 more)

### Community 4 - "Development Tooling"

Cohesion: 0.05
Nodes (42): devDependencies, @arethetypeswrong/cli, astro, @babel/core, commit-and-tag-version, @commitlint/cli, @commitlint/config-conventional, cz-git (+34 more)

### Community 5 - "Product Changelog"

Cohesion: 0.07
Nodes (39): Changelog Index, Release 1.12.0: Babel Plugin Support, Release 1.13.0: Broader Gulp Vinyl Modes, Release 1.14.0: CUR Support, Release 1.15.0: Rollup Integration, Release 1.16.0: Parcel Plugin, Release 1.17.0: Astro Wrapper, Release 1.17.1: WebP Lossless Compression Fix (+31 more)

### Community 6 - "Module Exports"

Cohesion: 0.11
Nodes (38): import, require, import, require, import, require, exports, ./astro (+30 more)

### Community 7 - "Early Releases"

Cohesion: 0.06
Nodes (32): Release 1.0.0, Alias and Global Commands, Release 1.0.1, Grunt Support, Release 1.10.0, esbuild Plugin, Release 1.11.0, Compression Race Issue (+24 more)

### Community 8 - "Programmatic API"

Cohesion: 0.12
Nodes (9): optimizeFile(), stripMetadata(), copyApiFixtureToWorkspace(), createApiWorkspace(), defineApiFormatTests(), getApiFixture(), copyFixtureToWorkspace(), fixture (+1 more)

### Community 9 - "Package Scripts"

Cohesion: 0.07
Nodes (30): scripts, build, check:exports, check:types, fixture-values, postinstall, prepack, prepare (+22 more)

### Community 10 - "Gulp Integration Tests"

Cohesion: 0.10
Nodes (21): file, fixtures, getGulpFixtures(), gulpFixtureKeys, options, plugin, rawFixtureKeys, runGulpPipeline() (+13 more)

### Community 11 - "API Option Normalization"

Cohesion: 0.15
Nodes (22): getOptimizationFixtureValues(), getOptimizationFixtureValuesForFiles(), optimizeFiles(), toApiResult(), attachOutputTargets(), NormalizedApiOptions, normalizeFileOptions(), normalizeFilesOptions() (+14 more)

### Community 12 - "Test Workspaces"

Cohesion: 0.11
Nodes (19): cleanupWorkspace(), createTempWorkspace(), createWorkspace(), createWorkspace(), createWorkspace(), createWorkspace(), createWorkspace(), createWorkspace() (+11 more)

### Community 13 - "Optional Peers"

Cohesion: 0.10
Nodes (21): optional, optional, optional, optional, optional, optional, optional, peerDependenciesMeta (+13 more)

### Community 14 - "Rollup Integration Tests"

Cohesion: 0.10
Nodes (16): baselineNames, buildProject(), createFixtureEmitterPlugin(), fallbackAsset, fileName, fixtures, getRollupFixtures(), optimizedNames (+8 more)

### Community 15 - "TypeScript Configuration"

Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 16 - "Parcel Integration Tests"

Cohesion: 0.13
Nodes (15): buildEntrySource(), buildProject(), createParcelCache(), fakeBin, fixtures, getParcelFixtures(), parcelFixtureKeys, rawFixtureKeys (+7 more)

### Community 17 - "Babel Asset Transformation"

Cohesion: 0.18
Nodes (17): BabelState, getRootCjsEntryPath(), isLocalAssetReference(), jsxAssetAttributes, optimizeGeneratedAsset(), rawExtensions, resolveGeneratedAssetPath(), rewriteImportDeclaration() (+9 more)

### Community 18 - "Package Metadata"

Cohesion: 0.12
Nodes (15): bugs, url, description, engines, parcel, files, homepage, keywords (+7 more)

### Community 19 - "Changelog Tooling"

Cohesion: 0.12
Nodes (15): allVersions, changelogPath, changelogsDir, existingVersions, files, indexMd, indexTree, md (+7 more)

### Community 20 - "Next Integration Tests"

Cohesion: 0.15
Nodes (13): buildNextConfigSource(), buildPageSource(), buildProject(), calls, fixtures, getNextFixtures(), nextConfig, nextFixtureKeys (+5 more)

### Community 21 - "esbuild Integration Tests"

Cohesion: 0.15
Nodes (11): buildEntrySource(), esbuildFixtureKeys, fixtures, getEsbuildFixtures(), options, plugin, rawFixtureKeys, scaffoldEsbuildProject() (+3 more)

### Community 22 - "Grunt Integration Tests"

Cohesion: 0.15
Nodes (9): buildGruntRunnerSource(), fixtures, getGruntFixtures(), gruntFixtureKeys, options, rawFixtureKeys, scaffoldGruntProject(), workspace (+1 more)

### Community 23 - "Vite Integration Tests"

Cohesion: 0.15
Nodes (11): buildMainSource(), fixtures, getViteFixtures(), options, plugin, rawFixtureKeys, scaffoldViteProject(), viteFixtureKeys (+3 more)

### Community 24 - "Webpack Integration Tests"

Cohesion: 0.15
Nodes (11): buildEntrySource(), fixtures, getWebpackFixtures(), options, plugin, rawFixtureKeys, scaffoldWebpackProject(), webpackFixtureKeys (+3 more)

### Community 25 - "Peer Dependencies"

Cohesion: 0.17
Nodes (12): peerDependencies, astro, @babel/core, esbuild, grunt, gulp, next, parcel (+4 more)

### Community 26 - "Fixture Definitions"

Cohesion: 0.22
Nodes (9): FixtureExpectation, fixtureRoot, FormatFixture, formatFixtures, isPlaceholderExpectation(), makeExpectation(), placeholderExpectations(), representativeFixtures (+1 more)

### Community 27 - "Babel Integration Tests"

Cohesion: 0.22
Nodes (10): hasRepresentativeFixture(), createWorkspace(), generatedCur, generatedPng, generatedWebp, loadBuiltBabelPlugin(), scaffoldBabelProject(), transformFixture() (+2 more)

### Community 28 - "CLI Tests"

Cohesion: 0.36
Nodes (6): createCli(), main(), registerCompressCommand(), expectedVersion, hoisted, parseCli()

### Community 29 - "Runtime Dependencies"

Cohesion: 0.25
Nodes (8): dependencies, chalk, commander, execa, fs-extra, glob, inquirer, ora

### Community 30 - "Release Preparation"

Cohesion: 0.29
Nodes (7): changelogContent, changelogFile, { date, content }, extractChangelogContent(), extractText(), packageJson, tempFile

### Community 31 - "Commit Message Rules"

Cohesion: 0.33
Nodes (5): commitMsg, lines, lowercaseSubject, match, newCommitMsg

### Community 32 - "Install Configuration"

Cohesion: 0.83
Nodes (3): detectPackageManager(), main(), resolveConfigDirectory()

### Community 33 - "CLI Binaries"

Cohesion: 0.67
Nodes (3): bin, squeezit, sqz

### Community 34 - "Config Metadata"

Cohesion: 0.67
Nodes (3): path, config, commitizen

### Community 35 - "Repository Metadata"

Cohesion: 0.67
Nodes (3): repository, type, url

### Community 36 - "Fixture Value Workflow"

Cohesion: 0.67
Nodes (3): getOptimizationFixtureValues, Fixture Value Workflow, Test Fixture Corpus

## Knowledge Gaps

- **345 isolated node(s):** `*.{js,jsx,ts,tsx}`, `*.{json,md,yml,yaml}`, `name`, `version`, `description` (+340 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `readPackageMetadata()` connect `CLI Commands` to `Package Metadata`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Development Tooling` to `Package Metadata`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `exports` connect `Module Exports` to `Package Metadata`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `*.{js,jsx,ts,tsx}`, `*.{json,md,yml,yaml}`, `name` to the rest of the system?**
  _346 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Optimization Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05216197666437886 - nodes in this community are weakly interconnected._
- **Should `Dependency Management` be split into smaller, more focused modules?**
  _Cohesion score 0.0582731889869019 - nodes in this community are weakly interconnected._
- **Should `CLI Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.07957393483709273 - nodes in this community are weakly interconnected._
