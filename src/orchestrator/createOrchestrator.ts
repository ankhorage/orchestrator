import { NodeCommandExecutor } from "../fs/exec";
import { NodeFileSystem } from "../fs/fileSystem";
import { resolveProjectPath } from "../fs/paths";
import type { OrchestratorServices } from "../fs/types";
import { ledgerPath } from "../ledger/helpers";
import type { ModuleLedger } from "../ledger/types";
import type { ModuleDefinition } from "../module/types";
import { executeModuleActions } from "./actionExecutor";
import { createModuleRegistry, resolveInstallOrder } from "./dependencyGraph";
import { uninstallFromLedger } from "./uninstall";

export interface CreateOrchestratorOptions {
  modules: ModuleDefinition[];
  projectRoot: string;
}

export interface InstallModuleOptions<TConfig = unknown> {
  config: TConfig;
}

export interface InstallModuleResult {
  installed: string[];
}

export interface RemoveModuleResult {
  removed: string[];
}

export interface Orchestrator {
  installModule(
    moduleId: string,
    options: InstallModuleOptions,
  ): Promise<InstallModuleResult>;
  removeModule(moduleId: string): Promise<RemoveModuleResult>;
}

export function createOrchestrator(
  options: CreateOrchestratorOptions,
): Orchestrator {
  return createOrchestratorWithServices(options, {
    fileSystem: new NodeFileSystem(),
    commandExecutor: new NodeCommandExecutor(),
  });
}

export function createOrchestratorWithServices(
  options: CreateOrchestratorOptions,
  services: OrchestratorServices,
): Orchestrator {
  const registry = createModuleRegistry(options.modules);
  const { fileSystem } = services;
  const { commandExecutor } = services;
  const now = services.now ?? (() => new Date().toISOString());

  return {
    async installModule(moduleId, installOptions) {
      const requestedModule = registry.get(moduleId);
      if (!requestedModule) {
        throw new Error(`Unknown module "${moduleId}".`);
      }

      const installOrder = resolveInstallOrder(moduleId, registry);
      const requestedLedger = await readLedger(
        options.projectRoot,
        moduleId,
        fileSystem,
      );

      if (requestedLedger) {
        await removeInstalledModule({
          projectRoot: options.projectRoot,
          moduleId,
          fileSystem,
          commandExecutor,
          skipDependencyCheck: true,
        });
      }

      const installedDuringOperation: string[] = [];

      try {
        for (const moduleDefinition of installOrder) {
          const existingLedger = await readLedger(
            options.projectRoot,
            moduleDefinition.id,
            fileSystem,
          );
          if (moduleDefinition.id !== moduleId && existingLedger) {
            continue;
          }

          const config =
            moduleDefinition.id === moduleId
              ? installOptions.config
              : (existingLedger?.config ?? {});

          const actions = await moduleDefinition.plan({
            projectRoot: options.projectRoot,
            moduleId: moduleDefinition.id,
            config,
          });

          const applied = await executeModuleActions({
            projectRoot: options.projectRoot,
            actions,
            fileSystem,
            commandExecutor,
            moduleId: moduleDefinition.id,
          });

          const ledger: ModuleLedger = {
            moduleId: moduleDefinition.id,
            moduleVersion: moduleDefinition.version,
            installedAt: now(),
            config,
            dependencies: [
              ...new Set(moduleDefinition.dependencies ?? []),
            ].sort((left, right) => left.localeCompare(right)),
            actions,
            applied,
          };

          await writeLedger(options.projectRoot, ledger, fileSystem);
          installedDuringOperation.push(moduleDefinition.id);
        }

        return {
          installed: installedDuringOperation,
        };
      } catch (error) {
        for (const installedModuleId of [
          ...installedDuringOperation,
        ].reverse()) {
          await removeInstalledModule({
            projectRoot: options.projectRoot,
            moduleId: installedModuleId,
            fileSystem,
            commandExecutor,
            skipDependencyCheck: true,
          });
        }

        throw error;
      }
    },

    async removeModule(moduleId) {
      await removeInstalledModule({
        projectRoot: options.projectRoot,
        moduleId,
        fileSystem,
        commandExecutor,
        skipDependencyCheck: false,
      });

      return {
        removed: [moduleId],
      };
    },
  };
}

async function removeInstalledModule(args: {
  projectRoot: string;
  moduleId: string;
  fileSystem: OrchestratorServices["fileSystem"];
  commandExecutor: OrchestratorServices["commandExecutor"];
  skipDependencyCheck: boolean;
}): Promise<void> {
  const {
    projectRoot,
    moduleId,
    fileSystem,
    commandExecutor,
    skipDependencyCheck,
  } = args;
  const ledger = await readLedger(projectRoot, moduleId, fileSystem);

  if (!ledger) {
    throw new Error(`Module "${moduleId}" is not installed.`);
  }

  if (!skipDependencyCheck) {
    const installedLedgers = await listLedgers(projectRoot, fileSystem);
    const dependents = installedLedgers
      .filter(
        (candidate) =>
          candidate.moduleId !== moduleId &&
          candidate.dependencies.includes(moduleId),
      )
      .map((candidate) => candidate.moduleId)
      .sort((left, right) => left.localeCompare(right));

    if (dependents.length > 0) {
      throw new Error(
        `Cannot remove "${moduleId}" while installed modules still depend on it: ${dependents.join(
          ", ",
        )}`,
      );
    }
  }

  await uninstallFromLedger({
    projectRoot,
    ledger,
    fileSystem,
    commandExecutor,
  });

  await deleteLedger(projectRoot, moduleId, fileSystem);
}

async function readLedger(
  projectRoot: string,
  moduleId: string,
  fileSystem: OrchestratorServices["fileSystem"],
): Promise<ModuleLedger | null> {
  return fileSystem.readJson<ModuleLedger>(
    resolveProjectPath(projectRoot, ledgerPath(moduleId)),
  );
}

async function writeLedger(
  projectRoot: string,
  ledger: ModuleLedger,
  fileSystem: OrchestratorServices["fileSystem"],
): Promise<void> {
  await fileSystem.writeJson(
    resolveProjectPath(projectRoot, ledgerPath(ledger.moduleId)),
    ledger,
  );
}

async function deleteLedger(
  projectRoot: string,
  moduleId: string,
  fileSystem: OrchestratorServices["fileSystem"],
): Promise<void> {
  await fileSystem.remove(
    resolveProjectPath(projectRoot, ledgerPath(moduleId)),
  );
}

async function listLedgers(
  projectRoot: string,
  fileSystem: OrchestratorServices["fileSystem"],
): Promise<ModuleLedger[]> {
  const ledgerDirectory = resolveProjectPath(projectRoot, ".ankh/ledger");
  const entries = await fileSystem.readDir(ledgerDirectory);
  const ledgers: ModuleLedger[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const text = await fileSystem.readJson<ModuleLedger>(
      resolveProjectPath(projectRoot, `.ankh/ledger/${entry}`),
    );
    if (text) {
      ledgers.push(text);
    }
  }

  return ledgers;
}
