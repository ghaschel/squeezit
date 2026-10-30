const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");
const run = promisify(require("node:child_process").execFile);
const repo = process.cwd();
const hosts = path.resolve(process.argv[2]);
const selected = new Set((process.argv[3] ?? "babel,esbuild,astro").split(","));
const supported = new Set([
  "babel",
  "esbuild",
  "astro",
  "gulp",
  "grunt",
  "rollup",
  "vite",
  "webpack",
  "parcel",
  "next",
]);
for (const host of selected)
  assert(supported.has(host), `Unknown host: ${host}`);
(async () => {
  const workspace = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "squeezit-host-floor-"))
  );
  const safe = await fs.readFile(
    path.join(repo, "tests/fixtures/formats/pdf/document.pdf")
  );
  const protectedBytes = await fs.readFile(
    path.join(repo, "tests/fixtures/formats/pdf/signature-field.pdf")
  );
  try {
    if (selected.has("babel")) {
      const babel = require(path.join(hosts, "@babel/core"));
      const babelDir = path.join(workspace, "babel");
      await fs.mkdir(babelDir);
      await fs.writeFile(path.join(babelDir, "document.pdf"), safe);
      await fs.writeFile(path.join(babelDir, "protected.pdf"), protectedBytes);
      const previous = process.cwd();
      process.chdir(babelDir);
      try {
        const { squeezitBabel } = require(path.join(repo, "dist/babel.cjs"));
        const output = babel.transformSync(
          'import safe from "./document.pdf"; const protectedDoc=require("./protected.pdf"); export const view=<a href="./document.pdf"/>;',
          {
            filename: path.join(babelDir, "entry.jsx"),
            configFile: false,
            babelrc: false,
            plugins: [
              [
                squeezitBabel,
                { productionOnly: false, checkDependencies: false },
              ],
            ],
            parserOpts: { plugins: ["jsx"] },
          }
        ).code;
        assert(output.includes(".squeezit/babel-assets/document.pdf"));
        assert(output.includes("./protected.pdf"));
        assert(
          (
            await fs.readFile(
              path.join(babelDir, ".squeezit/babel-assets/document.pdf")
            )
          ).length < safe.length
        );
        await assert.rejects(
          fs.stat(path.join(babelDir, ".squeezit/babel-assets/protected.pdf"))
        );
      } finally {
        process.chdir(previous);
      }
      console.log("PASS Babel", babel.version);
    }
    if (selected.has("esbuild")) {
      const esbuild = require(path.join(hosts, "esbuild"));
      const esDir = path.join(workspace, "esbuild");
      await fs.mkdir(esDir);
      await fs.writeFile(path.join(esDir, "document.pdf"), safe);
      await fs.writeFile(path.join(esDir, "protected.pdf"), protectedBytes);
      await fs.writeFile(
        path.join(esDir, "entry.js"),
        'import safe from "./document.pdf";import protectedDoc from "./protected.pdf";console.log(safe,protectedDoc);'
      );
      await esbuild.build({
        absWorkingDir: esDir,
        entryPoints: ["entry.js"],
        outdir: "out",
        bundle: true,
        loader: { ".pdf": "file" },
        plugins: [
          require(path.join(repo, "dist/esbuild.cjs")).squeezitEsbuild(),
        ],
        logLevel: "silent",
      });
      await check(path.join(esDir, "out"));
      console.log("PASS esbuild", esbuild.version);
    }
    if (selected.has("astro")) {
      const astroDir = path.join(workspace, "astro");
      await fs.mkdir(path.join(astroDir, "src/pages"), { recursive: true });
      await fs.mkdir(path.join(astroDir, "public"));
      await fs.symlink(hosts, path.join(astroDir, "node_modules"), "dir");
      await fs.writeFile(
        path.join(astroDir, "package.json"),
        '{"type":"module","private":true}'
      );
      await fs.writeFile(path.join(astroDir, "public/document.pdf"), safe);
      await fs.writeFile(
        path.join(astroDir, "public/protected.pdf"),
        protectedBytes
      );
      await fs.writeFile(
        path.join(astroDir, "src/pages/index.astro"),
        '<a href="/document.pdf">Document</a><a href="/protected.pdf">Protected</a>'
      );
      await fs.writeFile(
        path.join(astroDir, "astro.config.mjs"),
        `import {squeezitAstro} from ${JSON.stringify(pathToFileURL(path.join(repo, "dist/astro.js")).href)};export default {output:'static',integrations:[squeezitAstro()]};`
      );
      const astroPackage = JSON.parse(
        await fs.readFile(path.join(hosts, "astro/package.json"), "utf8")
      );
      await run(
        process.execPath,
        [path.join(hosts, "astro", astroPackage.bin.astro), "build"],
        {
          cwd: astroDir,
          env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
        }
      );
      await check(path.join(astroDir, "dist"));
      console.log("PASS Astro", astroPackage.version);
    }

    if (selected.has("gulp")) {
      const gulp = require(path.join(hosts, "gulp"));
      const directory = await prepare("gulp");
      const source = gulp.src(path.join(directory, "*.pdf"), {
        encoding: false,
      });
      const transform = require(
        path.join(repo, "dist/gulp.cjs")
      ).squeezitGulp();
      const destination = gulp.dest(path.join(directory, "out"));
      await new Promise((resolve, reject) => {
        source.on("error", reject);
        transform.on("error", reject);
        source
          .pipe(transform)
          .pipe(destination)
          .on("error", reject)
          .on("finish", resolve);
      });
      await check(path.join(directory, "out"));
      await passed("gulp");
    }
    if (selected.has("grunt")) {
      const grunt = require(path.join(hosts, "grunt"));
      const directory = await prepare("grunt");
      require(path.join(repo, "dist/grunt.cjs")).registerSqueezitTask(grunt);
      grunt.initConfig({
        squeezit: {
          pdf: {
            files: [
              {
                expand: true,
                cwd: directory,
                src: ["*.pdf"],
                dest: path.join(directory, "out"),
              },
            ],
          },
        },
      });
      await new Promise((resolve) =>
        grunt.tasks(["squeezit:pdf"], { gruntfile: false }, resolve)
      );
      assert.equal(grunt.fail.errorcount, 0);
      await check(path.join(directory, "out"));
      await passed("grunt");
    }
    if (selected.has("rollup")) {
      const { rollup } = require(path.join(hosts, "rollup"));
      const directory = await prepare("rollup");
      await fs.writeFile(
        path.join(directory, "entry.js"),
        'console.log("floor-rollup");'
      );
      const bundle = await rollup({
        input: path.join(directory, "entry.js"),
        plugins: [
          {
            name: "floor-pdf-emitter",
            buildStart() {
              this.emitFile({
                type: "asset",
                name: "document.pdf",
                source: safe,
              });
              this.emitFile({
                type: "asset",
                name: "protected.pdf",
                source: protectedBytes,
              });
            },
          },
          require(path.join(repo, "dist/rollup.cjs")).squeezitRollup(),
        ],
      });
      try {
        await bundle.write({
          dir: path.join(directory, "out"),
          format: "es",
          assetFileNames: "[name]-[hash][extname]",
        });
      } finally {
        await bundle.close();
      }
      await check(path.join(directory, "out"));
      await passed("rollup");
    }
    if (selected.has("vite")) {
      const { build } = await import(
        pathToFileURL(path.join(hosts, "vite/dist/node/index.js")).href
      );
      const directory = await prepare("vite");
      await fs.writeFile(
        path.join(directory, "index.html"),
        '<script type="module" src="/entry.js"></script>'
      );
      await build({
        root: directory,
        configFile: false,
        logLevel: "silent",
        build: { outDir: "out", assetsInlineLimit: 0 },
        plugins: [require(path.join(repo, "dist/vite.cjs")).squeezitVite()],
      });
      await check(path.join(directory, "out"));
      await passed("vite");
    }
    if (selected.has("webpack")) {
      const webpack = require(path.join(hosts, "webpack"));
      const directory = await prepare("webpack");
      const compiler = webpack({
        mode: "production",
        context: directory,
        entry: "./entry.js",
        output: {
          path: path.join(directory, "out"),
          filename: "bundle.js",
          assetModuleFilename: "[name]-[contenthash][ext]",
        },
        module: { rules: [{ test: /\.pdf$/i, type: "asset/resource" }] },
        plugins: [
          require(path.join(repo, "dist/webpack.cjs")).squeezitWebpack(),
        ],
      });
      try {
        await new Promise((resolve, reject) =>
          compiler.run((error, stats) =>
            error
              ? reject(error)
              : stats.hasErrors()
                ? reject(new Error(stats.toString()))
                : resolve()
          )
        );
      } finally {
        await new Promise((resolve, reject) =>
          compiler.close((error) => (error ? reject(error) : resolve()))
        );
      }
      await check(path.join(directory, "out"));
      await passed("webpack");
    }
    if (selected.has("parcel")) {
      const Parcel = require(path.join(hosts, "@parcel/core")).default;
      const { FSCache } = require(path.join(hosts, "@parcel/cache"));
      const { NodeFS } = require(path.join(hosts, "@parcel/fs"));
      const directory = await prepare("parcel");
      await fs.writeFile(path.join(directory, ".git"), "gitdir: fixture\n");
      await fs.writeFile(
        path.join(directory, "index.html"),
        '<script type="module" src="./parcel-entry.js"></script>'
      );
      await fs.writeFile(
        path.join(directory, "parcel-entry.js"),
        'import safe from "url:./document.pdf";import protectedDoc from "url:./protected.pdf";console.log(safe,protectedDoc);'
      );
      await fs.symlink(
        path.join(repo, "dist/parcel.cjs"),
        path.join(directory, "optimizer.cjs")
      );
      await fs.writeFile(
        path.join(directory, ".parcelrc"),
        JSON.stringify({
          extends: "@parcel/config-default",
          transformers: { "url:*": ["@parcel/transformer-raw"] },
          optimizers: { "*.pdf": ["./optimizer.cjs"] },
        })
      );
      const previous = process.cwd();
      process.chdir(directory);
      try {
        const bundler = new Parcel({
          entries: "index.html",
          defaultConfig: require.resolve(
            path.join(hosts, "@parcel/config-default")
          ),
          cache: new FSCache(
            new NodeFS(),
            path.join(directory, ".parcel-cache")
          ),
          mode: "production",
          shouldDisableCache: true,
          shouldPatchConsole: false,
          logLevel: "error",
          defaultTargetOptions: {
            distDir: path.join(directory, "out"),
            sourceMaps: false,
          },
        });
        await bundler.run();
      } finally {
        process.chdir(previous);
      }
      await check(path.join(directory, "out"));
      await passed("parcel");
    }
    if (selected.has("next")) {
      const directory = await prepare("next");
      await fs.mkdir(path.join(directory, "pages"));
      await fs.writeFile(
        path.join(directory, "pages/index.js"),
        'import React from "react";import safe from "../document.pdf?url";import protectedDoc from "../protected.pdf?url";export default function Page(){return React.createElement("div", null, React.createElement("a",{href:safe},"safe"), React.createElement("a",{href:protectedDoc},"protected"));}'
      );
      await fs.writeFile(
        path.join(directory, "next.config.js"),
        `const {withSqueezit}=require(${JSON.stringify(path.join(repo, "dist/next.cjs"))});module.exports=withSqueezit({webpack(config){config.module.rules.push({test:/\\.pdf$/i,resourceQuery:/url/,type:'asset/resource'});return config;}});`
      );
      await run(
        process.execPath,
        [
          path.join(hosts, "next/dist/bin/next"),
          "build",
          "--webpack",
          directory,
        ],
        {
          cwd: directory,
          env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
          maxBuffer: 8 * 1024 * 1024,
        }
      );
      await check(path.join(directory, ".next/static"));
      await passed("next");
    }
    async function prepare(name) {
      const directory = path.join(workspace, name);
      await fs.mkdir(directory);
      await fs.symlink(hosts, path.join(directory, "node_modules"), "dir");
      await fs.writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({ name: `squeezit-floor-${name}`, private: true })
      );
      await fs.writeFile(path.join(directory, "document.pdf"), safe);
      await fs.writeFile(path.join(directory, "protected.pdf"), protectedBytes);
      await fs.writeFile(
        path.join(directory, "entry.js"),
        'import safe from "./document.pdf";import protectedDoc from "./protected.pdf";console.log(safe,protectedDoc);'
      );
      return directory;
    }
    async function passed(name) {
      const pkg = JSON.parse(
        await fs.readFile(path.join(hosts, name, "package.json"), "utf8")
      );
      console.log("PASS", name, pkg.version);
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
  async function check(dir) {
    const paths = (await fs.readdir(dir, { recursive: true })).filter((p) =>
      p.endsWith(".pdf")
    );
    assert.equal(paths.length, 2);
    for (const p of paths) {
      const b = await fs.readFile(path.join(dir, p));
      if (path.basename(p).startsWith("protected"))
        assert.deepEqual(b, protectedBytes);
      else assert(b.length < safe.length);
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
