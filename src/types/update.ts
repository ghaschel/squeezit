export type PackageManager = "npm" | "bun" | "brew";

export interface InstallerConfig {
  packageManager: PackageManager;
  packageName: string;
  updatedAt: string;
}
