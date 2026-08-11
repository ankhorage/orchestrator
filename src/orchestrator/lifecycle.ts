import type { OrchestratorServices } from '../fs/types';
import {
  deleteModuleLedger,
  listModuleLedgers,
  readModuleLedger,
  writeModuleLedger,
} from '../ledger/store';
import type { ModuleLedger } from '../ledger/types';
import type { ModuleDefinition } from '../module/types';
import { executeModuleActions } from './actionExecutor';
import { resolveInstallOrder } from './dependencyGraph';
import {
  captureReconfigureFileSnapshot,
  type ReconfigureFileSnapshot,
  restoreReconfigureFileSnapshot,
} from './reconfigureSnapshot';
import { uninstallFromLedger } from './uninstall';

export interface ModuleLifecycleContext {
  readonly projectRoot: string;
  readonly registry: ReadonlyMap<string, ModuleDefinition>;
  readonly fileSystem: OrchestratorServices['fileSystem'];
  readonly commandExecutor: OrchestratorServices['commandExecutor'];
  readonly now: () => string;
}

export async function installRequestedModule(
  context: ModuleLifecycleContext,
  moduleId: string,
  config: unknown,
): Promise<string[]> {
  requireRegisteredModule(context.registry, moduleId);

  if (await readModuleLedger(context.projectRoot, moduleId, context.fileSystem)) {
    throw new Error(
      `Module "${moduleId}" is already installed. Use reconfigureModule() to update its config.`,
    );
  }

  const installOrder = resolveInstallOrder(moduleId, context.registry);
  return installMissingModules(context, installOrder, moduleId, config);
}

export async function reconfigureRequestedModule(
  context: ModuleLifecycleContext,
  moduleId: string,
  config: unknown,
): Promise<{ installed: string[]; reconfigured: string }> {
  const definition = requireRegisteredModule(context.registry, moduleId);
  const previousLedger = await readModuleLedger(context.projectRoot, moduleId, context.fileSystem);

  if (!previousLedger) {
    throw new Error(`Module "${moduleId}" is not installed.`);
  }

  const installOrder = resolveInstallOrder(moduleId, context.registry);
  const dependencyOrder = installOrder.filter((candidate) => candidate.id !== moduleId);
  const installed = await installMissingModules(context, dependencyOrder, moduleId, config);

  try {
    await replaceInstalledModule(context, definition, previousLedger, config);
  } catch (error) {
    await removeModulesAfterFailedOperation(context, installed, error);
    throw error;
  }

  return { installed, reconfigured: moduleId };
}

export async function removeRequestedModule(
  context: ModuleLifecycleContext,
  moduleId: string,
): Promise<void> {
  await removeInstalledModule(context, moduleId, false);
}

async function installMissingModules(
  context: ModuleLifecycleContext,
  installOrder: readonly ModuleDefinition[],
  requestedModuleId: string,
  requestedConfig: unknown,
): Promise<string[]> {
  const installed: string[] = [];

  try {
    for (const definition of installOrder) {
      const existing = await readModuleLedger(
        context.projectRoot,
        definition.id,
        context.fileSystem,
      );
      if (existing) {
        continue;
      }

      const config = definition.id === requestedModuleId ? requestedConfig : {};
      await applyModule(context, definition, config);
      installed.push(definition.id);
    }
    return installed;
  } catch (error) {
    await removeModulesAfterFailedOperation(context, installed, error);
    throw error;
  }
}

async function applyModule(
  context: ModuleLifecycleContext,
  definition: ModuleDefinition,
  config: unknown,
): Promise<ModuleLedger> {
  const actions = await definition.plan({
    projectRoot: context.projectRoot,
    moduleId: definition.id,
    config,
  });
  const applied = await executeModuleActions({
    projectRoot: context.projectRoot,
    actions,
    fileSystem: context.fileSystem,
    commandExecutor: context.commandExecutor,
    moduleId: definition.id,
  });
  const ledger = createLedger(context, definition, config, actions, applied);

  try {
    await writeModuleLedger(context.projectRoot, ledger, context.fileSystem);
  } catch (error) {
    await uninstallFromLedger({
      projectRoot: context.projectRoot,
      ledger,
      fileSystem: context.fileSystem,
      commandExecutor: context.commandExecutor,
    });
    throw error;
  }

  return ledger;
}

async function replaceInstalledModule(
  context: ModuleLifecycleContext,
  definition: ModuleDefinition,
  previousLedger: ModuleLedger,
  config: unknown,
): Promise<void> {
  const actions = await definition.plan({
    projectRoot: context.projectRoot,
    moduleId: definition.id,
    config,
  });
  const fileSnapshot = await captureReconfigureFileSnapshot({
    projectRoot: context.projectRoot,
    applied: previousLedger.applied,
    fileSystem: context.fileSystem,
  });
  let nextLedger: ModuleLedger | undefined;

  try {
    await uninstallFromLedger({
      projectRoot: context.projectRoot,
      ledger: previousLedger,
      fileSystem: context.fileSystem,
      commandExecutor: context.commandExecutor,
    });
    const applied = await executeModuleActions({
      projectRoot: context.projectRoot,
      actions,
      fileSystem: context.fileSystem,
      commandExecutor: context.commandExecutor,
      moduleId: definition.id,
    });
    nextLedger = createLedger(
      context,
      definition,
      config,
      actions,
      applied,
      previousLedger.installedAt,
    );
    await writeModuleLedger(context.projectRoot, nextLedger, context.fileSystem);
  } catch (error) {
    await restorePreviousModule(context, previousLedger, nextLedger, fileSnapshot, error);
    throw error;
  }
}

async function restorePreviousModule(
  context: ModuleLifecycleContext,
  previousLedger: ModuleLedger,
  nextLedger: ModuleLedger | undefined,
  fileSnapshot: ReconfigureFileSnapshot,
  originalError: unknown,
): Promise<void> {
  try {
    if (nextLedger) {
      await uninstallFromLedger({
        projectRoot: context.projectRoot,
        ledger: nextLedger,
        fileSystem: context.fileSystem,
        commandExecutor: context.commandExecutor,
      });
    }

    const applied = await executeModuleActions({
      projectRoot: context.projectRoot,
      actions: previousLedger.actions,
      fileSystem: context.fileSystem,
      commandExecutor: context.commandExecutor,
      moduleId: previousLedger.moduleId,
    });
    await restoreReconfigureFileSnapshot({
      projectRoot: context.projectRoot,
      snapshot: fileSnapshot,
      fileSystem: context.fileSystem,
    });
    await writeModuleLedger(
      context.projectRoot,
      { ...previousLedger, applied },
      context.fileSystem,
    );
  } catch (restoreError) {
    throw new AggregateError(
      [originalError, restoreError],
      `Reconfiguration of "${previousLedger.moduleId}" failed and its previous state could not be restored.`,
      { cause: restoreError },
    );
  }
}

async function removeModulesAfterFailedOperation(
  context: ModuleLifecycleContext,
  moduleIds: readonly string[],
  originalError: unknown,
): Promise<void> {
  try {
    for (const moduleId of [...moduleIds].reverse()) {
      await removeInstalledModule(context, moduleId, true);
    }
  } catch (cleanupError) {
    throw new AggregateError(
      [originalError, cleanupError],
      'Module operation failed and newly installed dependencies could not be removed.',
      { cause: cleanupError },
    );
  }
}

async function removeInstalledModule(
  context: ModuleLifecycleContext,
  moduleId: string,
  skipDependencyCheck: boolean,
): Promise<void> {
  const ledger = await readModuleLedger(context.projectRoot, moduleId, context.fileSystem);
  if (!ledger) {
    throw new Error(`Module "${moduleId}" is not installed.`);
  }

  if (!skipDependencyCheck) {
    const installedLedgers = await listModuleLedgers(context.projectRoot, context.fileSystem);
    const dependents = installedLedgers
      .filter(
        (candidate) => candidate.moduleId !== moduleId && candidate.dependencies.includes(moduleId),
      )
      .map((candidate) => candidate.moduleId)
      .sort((left, right) => left.localeCompare(right));

    if (dependents.length > 0) {
      throw new Error(
        `Cannot remove "${moduleId}" while installed modules still depend on it: ${dependents.join(
          ', ',
        )}`,
      );
    }
  }

  await uninstallFromLedger({
    projectRoot: context.projectRoot,
    ledger,
    fileSystem: context.fileSystem,
    commandExecutor: context.commandExecutor,
  });
  await deleteModuleLedger(context.projectRoot, moduleId, context.fileSystem);
}

function createLedger(
  context: ModuleLifecycleContext,
  definition: ModuleDefinition,
  config: unknown,
  actions: ModuleLedger['actions'],
  applied: ModuleLedger['applied'],
  installedAt = context.now(),
): ModuleLedger {
  return {
    moduleId: definition.id,
    moduleVersion: definition.version,
    installedAt,
    config,
    dependencies: [...new Set(definition.dependencies ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    actions,
    applied,
  };
}

function requireRegisteredModule(
  registry: ReadonlyMap<string, ModuleDefinition>,
  moduleId: string,
): ModuleDefinition {
  const definition = registry.get(moduleId);
  if (!definition) {
    throw new Error(`Unknown module "${moduleId}".`);
  }
  return definition;
}
