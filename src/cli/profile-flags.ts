import { Flags } from "@oclif/core";

export function optimizationProfileFlags(description: string) {
  return {
    profile: Flags.option({
      description,
      default: "standard",
      options: ["standard", "max"] as const,
    })(),
    max: Flags.boolean({
      char: "m",
      description: "Shortcut for --profile max; use either spelling.",
      exclusive: ["profile"],
    }),
  };
}
