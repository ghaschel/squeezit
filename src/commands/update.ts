import type { CompressCliFlags } from "../types";
import { parsePackageManagerOption, runSelfUpdate } from "../utils";

export async function handleUpdateFlags(
  flags: CompressCliFlags
): Promise<boolean> {
  const shouldUpdate = flags.update ?? false;
  const shouldCheck = flags.checkUpdate ?? false;

  if (!shouldUpdate && !shouldCheck) {
    return false;
  }

  await runSelfUpdate({
    performUpdate: shouldUpdate,
    overridePackageManager: flags.pm
      ? parsePackageManagerOption(flags.pm)
      : null,
  });

  return true;
}
