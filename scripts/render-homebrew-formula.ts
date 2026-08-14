import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { DEPENDENCY_CATALOG } from "../src/core/dependencies";

interface FormulaArguments {
  output: string;
  sha256: string;
  version: string;
}

function parseArguments(argv: string[]): FormulaArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!flag?.startsWith("--") || !value || values.has(flag)) {
      throw new Error(
        "Expected --version, --sha256, and --output exactly once"
      );
    }

    values.set(flag, value);
  }

  const version = values.get("--version");
  const sha256 = values.get("--sha256");
  const output = values.get("--output");

  if (
    values.size !== 3 ||
    !version ||
    !sha256 ||
    !output ||
    !/^[0-9a-f]{64}$/i.test(sha256)
  ) {
    throw new Error("Expected --version, --sha256, and --output exactly once");
  }

  return { output, sha256: sha256.toLowerCase(), version };
}

function homebrewDependencies(): string[] {
  return [
    ...new Set(
      Object.values(DEPENDENCY_CATALOG)
        .filter((dependency) => !dependency.systemProvided)
        .flatMap((dependency) => dependency.brewPackage ?? [])
    ),
  ].sort();
}

function renderFormula({ version, sha256 }: FormulaArguments): string {
  const dependencies = homebrewDependencies()
    .map((dependency) => `  depends_on "${dependency}"`)
    .join("\n");

  return `class Squeezit < Formula
  desc "Lossless image optimizer CLI"
  homepage "https://github.com/ghaschel/squeezit"
  url "https://registry.npmjs.org/squeezit/-/squeezit-${version}.tgz"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"
${dependencies}

  def install
    system "npm", "install", *std_npm_args
    (bin/"sqz").write_env_script libexec/"bin/sqz",
      SQUEEZIT_MOZJPEGTRAN: Formula["mozjpeg"].opt_bin/"jpegtran"
    (bin/"squeezit").write_env_script libexec/"bin/squeezit",
      SQUEEZIT_MOZJPEGTRAN: Formula["mozjpeg"].opt_bin/"jpegtran"
  end

  test do
    require "json"
    assert_equal version.to_s, JSON.parse(shell_output("#{bin}/sqz version --json")).dig("data", "version")
  end
end
`;
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const output = resolve(arguments_.output);

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderFormula(arguments_));
}

await main();
