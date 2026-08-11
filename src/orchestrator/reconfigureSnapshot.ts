import path from 'node:path';

import { resolveProjectPath } from '../fs/paths';
import type { FileSystem } from '../fs/types';
import type { AppliedOperation } from '../ledger/types';

export type ReconfigureFileSnapshot = ReadonlyMap<string, string | null>;

export async function captureReconfigureFileSnapshot(args: {
  readonly projectRoot: string;
  readonly applied: readonly AppliedOperation[];
  readonly fileSystem: FileSystem;
}): Promise<ReconfigureFileSnapshot> {
  const paths = [...new Set(args.applied.map(getFilePath).filter(isDefined))].sort(compareText);
  const snapshot = new Map<string, string | null>();

  for (const relativePath of paths) {
    snapshot.set(
      relativePath,
      await args.fileSystem.readText(resolveProjectPath(args.projectRoot, relativePath)),
    );
  }

  return snapshot;
}

export async function restoreReconfigureFileSnapshot(args: {
  readonly projectRoot: string;
  readonly snapshot: ReconfigureFileSnapshot;
  readonly fileSystem: FileSystem;
}): Promise<void> {
  for (const [relativePath, content] of args.snapshot) {
    const absolutePath = resolveProjectPath(args.projectRoot, relativePath);
    if (content === null) {
      await args.fileSystem.remove(absolutePath);
      continue;
    }
    await args.fileSystem.ensureDir(path.dirname(absolutePath));
    await args.fileSystem.writeText(absolutePath, content);
  }
}

function getFilePath(operation: AppliedOperation): string | undefined {
  return operation.kind === 'pkg-add' ? undefined : operation.path;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
