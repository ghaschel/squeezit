export type PackageManager = "npm" | "bun";

export interface InstallerConfig {
  packageManager: PackageManager;
  packageName: string;
  updatedAt: string;
}
