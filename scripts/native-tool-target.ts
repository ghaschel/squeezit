import targets from "./native-tool-targets.json";

const name = process.argv[2];
if (!name || !Object.hasOwn(targets, name)) {
  throw new Error(`Unknown native tool target: ${name ?? "(missing)"}`);
}
const target = targets[name as keyof typeof targets];
if (
  !/^\d+(?:\.\d+)+(?:-\d+)?$/.test(target.version) ||
  !/^https:\/\/\S+$/.test(target.sourceUrl) ||
  !/^[a-f0-9]{64}$/.test(target.sha256)
) {
  throw new Error(`Invalid source receipt for ${name}`);
}
console.log([target.version, target.sourceUrl, target.sha256].join(" "));
