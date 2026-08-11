import { NodeCommandExecutor } from '../fs/exec';
import { NodeFileSystem } from '../fs/fileSystem';
import type { OrchestratorServices } from '../fs/types';
import { listModuleLedgers } from '../ledger/store';
import type { ModuleDefinition } from '../module/types';
import { createModuleRegistry } from './dependencyGraph';
import {
  installRequestedModule,
  type ModuleLifecycleContext,
  reconfigureRequestedModule,
  removeRequestedModule,
} from './lifecycle';
import { type ModuleState, resolveModuleStates } from './moduleState';

export interface CreateOrchestratorOptions {
  modules: ModuleDefinition[];
  projectRoot: string;
}

export interface InstallModuleOptions<TConfig = unknown> {
  config: TConfig;
}

export interface ReconfigureModuleOptions<TConfig = unknown> {
  config: TConfig;
}

export interface InstallModuleResult {
  installed: string[];
}

export interface ReconfigureModuleResult {
  installed: string[];
  reconfigured: string;
}

export interface RemoveModuleResult {
  removed: string[];
}

export interface Orchestrator {
  listModules(): Promise<readonly ModuleState[]>;
  getModule(moduleId: string): Promise<ModuleState | null>;
  installModule(moduleId: string, options: InstallModuleOptions): Promise<InstallModuleResult>;
  reconfigureModule(
    moduleId: string,
    options: ReconfigureModuleOptions,
  ): Promise<ReconfigureModuleResult>;
  removeModule(moduleId: string): Promise<RemoveModuleResult>;
}

export function createOrchestrator(options: CreateOrchestratorOptions): Orchestrator {
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
  const context: ModuleLifecycleContext = {
    projectRoot: options.projectRoot,
    registry,
    fileSystem: services.fileSystem,
    commandExecutor: services.commandExecutor,
    now: services.now ?? (() => new Date().toISOString()),
  };
  const listStates = async () => {
    const ledgers = await listModuleLedgers(context.projectRoot, context.fileSystem);
    return resolveModuleStates(registry, ledgers);
  };

  return {
    listModules: listStates,

    async getModule(moduleId) {
      const states = await listStates();
      return states.find((state) => state.moduleId === moduleId) ?? null;
    },

    async installModule(moduleId, installOptions) {
      return {
        installed: await installRequestedModule(context, moduleId, installOptions.config),
      };
    },

    async reconfigureModule(moduleId, reconfigureOptions) {
      return reconfigureRequestedModule(context, moduleId, reconfigureOptions.config);
    },

    async removeModule(moduleId) {
      await removeRequestedModule(context, moduleId);
      return { removed: [moduleId] };
    },
  };
}
