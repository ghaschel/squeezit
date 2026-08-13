import type { CoreBatchOptions } from "./core";

export type ProgressMode = "auto" | "off";
export type OptimizationProfile = "standard" | "max";

export interface CompressCliFlags {
  profile?: OptimizationProfile;
  recursive?: boolean;
  max?: boolean;
  stripMeta?: boolean;
  exif?: boolean;
  dryRun?: boolean;
  keepTime?: boolean;
  concurrency?: number;
  installDeps?: boolean;
  verbose?: boolean;
  threshold?: number;
  inPlace?: boolean;
  progress?: ProgressMode;
  update?: boolean;
  checkUpdate?: boolean;
  pm?: string;
}

export interface CompressCommandOptions extends CoreBatchOptions {
  installDeps: boolean;
  verbose: boolean;
  progress: ProgressMode;
}
