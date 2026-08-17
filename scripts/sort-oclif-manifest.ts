import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "..", "oclif.manifest.json");

const source = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(source) as Record<string, unknown>;
const commands = manifest.commands;

if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
  throw new Error("Oclif manifest does not contain a commands object.");
}

manifest.commands = Object.fromEntries(
  Object.entries(commands).sort(([left], [right]) => left.localeCompare(right))
);

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
