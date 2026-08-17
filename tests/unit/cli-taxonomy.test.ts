import { describe, expect, test } from "vitest";

import Capabilities from "../../src/cli/commands/capabilities";
import Compress from "../../src/cli/commands/compress";
import DependenciesDoctor from "../../src/cli/commands/deps/doctor";
import DependenciesInstall from "../../src/cli/commands/deps/install";
import Doctor from "../../src/cli/commands/doctor";
import MetadataStrip from "../../src/cli/commands/metadata/strip";
import PlanApply from "../../src/cli/commands/plan/apply";
import PlanCompress from "../../src/cli/commands/plan/compress";
import PlanMetadataStrip from "../../src/cli/commands/plan/metadata/strip";
import UpdateApply from "../../src/cli/commands/update/apply";
import UpdateCheck from "../../src/cli/commands/update/check";

describe("Oclif command taxonomy", () => {
  test("defines each approved operational command", () => {
    expect(Compress.name).toBe("Compress");
    expect(Capabilities.name).toBe("Capabilities");
    expect(MetadataStrip.name).toBe("MetadataStrip");
    expect(PlanApply.name).toBe("PlanApply");
    expect(PlanCompress.name).toBe("PlanCompress");
    expect(PlanMetadataStrip.name).toBe("PlanMetadataStrip");
    expect(DependenciesDoctor.name).toBe("DependenciesDoctor");
    expect(DependenciesInstall.name).toBe("DependenciesInstall");
    expect(Doctor.name).toBe("Doctor");
    expect(UpdateCheck.name).toBe("UpdateCheck");
    expect(UpdateApply.name).toBe("UpdateApply");
  });

  test("keeps exif as the metadata strip alias", () => {
    expect(MetadataStrip.aliases).toContain("exif");
    expect(PlanMetadataStrip.aliases).toContain("plan:exif");
  });

  test("makes profile, progress, and package manager choices discoverable", () => {
    expect(Compress.flags.profile.options).toEqual(["standard", "max"]);
    expect(Compress.flags.progress.options).toEqual(["auto", "off"]);
    expect(UpdateCheck.flags.pm.options).toEqual(["npm", "bun", "brew"]);
    expect(PlanCompress.flags.profile.options).toEqual(["standard", "max"]);
    expect(PlanApply.flags.progress.options).toEqual(["auto", "off"]);
    expect(PlanCompress.flags.output.required).toBe(true);
  });

  test("keeps plan creation semantic-only and plan apply presentation-only", () => {
    expect(Object.keys(PlanCompress.flags)).toEqual(
      expect.arrayContaining([
        "concurrency",
        "in-place",
        "keep-time",
        "output",
        "profile",
        "recursive",
        "strip-meta",
        "threshold",
        "verbose",
      ])
    );
    expect(Object.keys(PlanCompress.flags)).not.toEqual(
      expect.arrayContaining(["dry-run", "progress", "yes"])
    );
    expect(Object.keys(PlanApply.flags)).toEqual([
      "yes",
      "progress",
      "verbose",
    ]);
  });

  test("enables the JSON contract on Squeezit-owned commands", () => {
    expect(Compress.enableJsonFlag).toBe(true);
    expect(DependenciesDoctor.enableJsonFlag).toBe(true);
    expect(UpdateApply.enableJsonFlag).toBe(true);
    expect(Capabilities.enableJsonFlag).toBe(true);
    expect(PlanCompress.enableJsonFlag).toBe(true);
    expect(PlanMetadataStrip.enableJsonFlag).toBe(true);
    expect(PlanApply.enableJsonFlag).toBe(true);
  });
});
