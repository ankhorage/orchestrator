import type { ModuleLedger } from '../ledger/types';
import type { ModuleDefinition } from '../module/types';

export interface ModuleRegistrationState {
  readonly version?: string;
  readonly dependencies: readonly string[];
}

export interface ModuleInstallationState {
  readonly version?: string;
  readonly installedAt: string;
  readonly config: unknown;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface AvailableUninstalledModuleState {
  readonly moduleId: string;
  readonly available: true;
  readonly installed: false;
  readonly registration: ModuleRegistrationState;
}

export interface AvailableInstalledModuleState {
  readonly moduleId: string;
  readonly available: true;
  readonly installed: true;
  readonly registration: ModuleRegistrationState;
  readonly installation: ModuleInstallationState;
}

export interface UnavailableInstalledModuleState {
  readonly moduleId: string;
  readonly available: false;
  readonly installed: true;
  readonly installation: ModuleInstallationState;
}

export type ModuleState =
  AvailableInstalledModuleState | AvailableUninstalledModuleState | UnavailableInstalledModuleState;

export function resolveModuleStates(
  registry: ReadonlyMap<string, ModuleDefinition>,
  ledgers: readonly ModuleLedger[],
): ModuleState[] {
  const ledgersById = new Map(ledgers.map((ledger) => [ledger.moduleId, ledger]));
  const dependentsById = resolveDependents(ledgers);
  const moduleIds = new Set([...registry.keys(), ...ledgersById.keys()]);

  return [...moduleIds]
    .sort((left, right) => left.localeCompare(right))
    .map((moduleId) => resolveModuleState(moduleId, registry, ledgersById, dependentsById));
}

function resolveModuleState(
  moduleId: string,
  registry: ReadonlyMap<string, ModuleDefinition>,
  ledgersById: ReadonlyMap<string, ModuleLedger>,
  dependentsById: ReadonlyMap<string, readonly string[]>,
): ModuleState {
  const definition = registry.get(moduleId);
  const ledger = ledgersById.get(moduleId);
  const registration = definition ? toRegistrationState(definition) : undefined;
  const installation = ledger
    ? toInstallationState(ledger, dependentsById.get(moduleId) ?? [])
    : undefined;

  if (registration && installation) {
    return { moduleId, available: true, installed: true, registration, installation };
  }
  if (registration) {
    return { moduleId, available: true, installed: false, registration };
  }
  if (installation) {
    return { moduleId, available: false, installed: true, installation };
  }

  throw new Error(`Cannot resolve module state for "${moduleId}".`);
}

function toRegistrationState(definition: ModuleDefinition): ModuleRegistrationState {
  return {
    version: definition.version,
    dependencies: normalizeIds(definition.dependencies ?? []),
  };
}

function toInstallationState(
  ledger: ModuleLedger,
  dependents: readonly string[],
): ModuleInstallationState {
  return {
    version: ledger.moduleVersion,
    installedAt: ledger.installedAt,
    config: ledger.config,
    dependencies: normalizeIds(ledger.dependencies),
    dependents: normalizeIds(dependents),
  };
}

function resolveDependents(ledgers: readonly ModuleLedger[]): Map<string, readonly string[]> {
  const dependentsById = new Map<string, Set<string>>();

  for (const ledger of ledgers) {
    for (const dependencyId of ledger.dependencies) {
      const dependents = dependentsById.get(dependencyId) ?? new Set<string>();
      dependents.add(ledger.moduleId);
      dependentsById.set(dependencyId, dependents);
    }
  }

  return new Map(
    [...dependentsById].map(([moduleId, dependents]) => [moduleId, normalizeIds(dependents)]),
  );
}

function normalizeIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}
