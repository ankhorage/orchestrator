import type { ModuleAction } from "../actions/types";

export interface PackageAdditionOperation {
  kind: "pkg-add";
  name: string;
  version?: string;
  dev?: boolean;
}

export interface FileWriteOperation {
  kind: "file-write";
  path: string;
  prevContent: string | null;
}

export interface TextBlockInsertOperation {
  kind: "text-block-insert";
  path: string;
  blockId: string;
  created: boolean;
}

export interface JsonSetOperation {
  kind: "json-set";
  path: string;
  jsonPath: string;
  prevExists: boolean;
  prev: unknown;
  next: unknown;
}

export interface JsonFileSnapshotOperation {
  kind: "json-file-snapshot";
  path: string;
  prevContent: string | null;
}

export type AppliedOperation =
  | PackageAdditionOperation
  | FileWriteOperation
  | TextBlockInsertOperation
  | JsonSetOperation
  | JsonFileSnapshotOperation;

export interface ModuleLedger {
  moduleId: string;
  moduleVersion?: string;
  installedAt: string;
  config: unknown;
  dependencies: string[];
  actions: ModuleAction[];
  applied: AppliedOperation[];
}
