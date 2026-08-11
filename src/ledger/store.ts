import { resolveProjectPath } from '../fs/paths';
import type { FileSystem } from '../fs/types';
import { LEDGER_DIR, ledgerPath } from './helpers';
import type { ModuleLedger } from './types';

export function readModuleLedger(
  projectRoot: string,
  moduleId: string,
  fileSystem: FileSystem,
): Promise<ModuleLedger | null> {
  return fileSystem.readJson<ModuleLedger>(resolveProjectPath(projectRoot, ledgerPath(moduleId)));
}

export function writeModuleLedger(
  projectRoot: string,
  ledger: ModuleLedger,
  fileSystem: FileSystem,
): Promise<void> {
  return fileSystem.writeJson(resolveProjectPath(projectRoot, ledgerPath(ledger.moduleId)), ledger);
}

export function deleteModuleLedger(
  projectRoot: string,
  moduleId: string,
  fileSystem: FileSystem,
): Promise<void> {
  return fileSystem.remove(resolveProjectPath(projectRoot, ledgerPath(moduleId)));
}

export async function listModuleLedgers(
  projectRoot: string,
  fileSystem: FileSystem,
): Promise<ModuleLedger[]> {
  const ledgerDirectory = resolveProjectPath(projectRoot, LEDGER_DIR);
  const entries = await fileSystem.readDir(ledgerDirectory);
  const ledgers: ModuleLedger[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }

    const ledger = await fileSystem.readJson<ModuleLedger>(
      resolveProjectPath(projectRoot, `${LEDGER_DIR}/${entry}`),
    );
    if (ledger) {
      ledgers.push(ledger);
    }
  }

  return ledgers.sort((left, right) => left.moduleId.localeCompare(right.moduleId));
}
