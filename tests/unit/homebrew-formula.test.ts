import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

describe("Homebrew formula renderer", () => {
  test("renders an npm-tarball formula with catalog-derived dependencies and both CLI aliases", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "squeezit-formula-"));
    const output = resolve(directory, "squeezit.rb");

    await run(
      "bun",
      [
        "scripts/render-homebrew-formula.ts",
        "--version",
        "1.17.1",
        "--sha256",
        "a".repeat(64),
        "--output",
        output,
      ],
      { cwd: root }
    );

    const formula = await readFile(output, "utf8");

    expect(formula).toContain("class Squeezit < Formula");
    expect(formula).toContain(
      'url "https://registry.npmjs.org/squeezit/-/squeezit-1.17.1.tgz"'
    );
    expect(formula).toContain(`sha256 "${"a".repeat(64)}"`);
    expect(formula).toContain('depends_on "node"');
    expect(formula).not.toContain('depends_on "file"');
    expect(formula).toContain('depends_on "mozjpeg"');
    expect(formula).toContain('depends_on "webp"');
    expect(formula).toContain('system "npm", "install", *std_npm_args');
    expect(formula).toContain('bin.write_env_script libexec/"bin/sqz"');
    expect(formula).toContain('bin.write_env_script libexec/"bin/squeezit"');
    expect(formula).toContain(
      'SQUEEZIT_MOZJPEGTRAN: Formula["mozjpeg"].opt_bin/"jpegtran"'
    );
    expect(formula).toContain(
      'JSON.parse(shell_output("#{bin}/sqz version --json")).dig("data", "version")'
    );

    const dependencyLines = formula
      .split("\n")
      .filter(
        (line) =>
          line.startsWith('  depends_on "') && line !== '  depends_on "node"'
      );
    expect(dependencyLines).toEqual([
      '  depends_on "dnglab"',
      '  depends_on "exiftool"',
      '  depends_on "gifsicle"',
      '  depends_on "icoutils"',
      '  depends_on "imagemagick"',
      '  depends_on "jpeg-xl"',
      '  depends_on "jpegoptim"',
      '  depends_on "libavif"',
      '  depends_on "libheif"',
      '  depends_on "libtiff"',
      '  depends_on "mozjpeg"',
      '  depends_on "optipng"',
      '  depends_on "oxipng"',
      '  depends_on "pngcrush"',
      '  depends_on "svgo"',
      '  depends_on "webp"',
      '  depends_on "zopfli"',
    ]);
  });
});
