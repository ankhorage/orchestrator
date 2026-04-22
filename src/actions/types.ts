export interface ModuleDependency {
  name: string;
  version?: string;
  dev?: boolean;
}

export interface EnsurePackagesAction {
  type: "ensure-packages";
  add: ModuleDependency[];
}

export interface WriteFileInstruction {
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface WriteFilesAction {
  type: "write-files";
  files: WriteFileInstruction[];
}

export interface JsonSetAction {
  type: "json-set";
  path: string;
  jsonPath: string;
  value: unknown;
  createMissing?: boolean;
  expected?: unknown;
}

export interface PatchTextBlockAction {
  type: "patch-text-block";
  path: string;
  blockId: string;
  content: string;
  anchor?: {
    find: string;
    position: "before" | "after";
  };
}

export type ModuleAction =
  | EnsurePackagesAction
  | WriteFilesAction
  | JsonSetAction
  | PatchTextBlockAction;
