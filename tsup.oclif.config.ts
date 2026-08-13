import { globSync } from "glob";
import { defineConfig } from "tsup";

const entry = Object.fromEntries(
  globSync("src/cli/commands/**/*.ts").map((file) => [
    file.replace(/^src\/cli\/(.+)\.ts$/, "$1"),
    file,
  ])
);

if (Object.keys(entry).length === 0) {
  throw new Error("No Oclif command sources found in src/cli/commands.");
}

export default defineConfig({
  entry,
  format: ["esm"],
  sourcemap: true,
  clean: false,
  splitting: false,
  target: "node22",
  outDir: "dist",
  external: ["@oclif/core"],
});
