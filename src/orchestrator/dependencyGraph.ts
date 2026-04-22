import type { ModuleDefinition } from "../module/types";

export function createModuleRegistry(
  modules: ModuleDefinition[],
): Map<string, ModuleDefinition> {
  const registry = new Map<string, ModuleDefinition>();

  for (const moduleDefinition of modules) {
    if (registry.has(moduleDefinition.id)) {
      throw new Error(`Duplicate module definition "${moduleDefinition.id}".`);
    }
    registry.set(moduleDefinition.id, moduleDefinition);
  }

  return registry;
}

export function resolveInstallOrder(
  moduleId: string,
  registry: Map<string, ModuleDefinition>,
): ModuleDefinition[] {
  if (!registry.has(moduleId)) {
    throw new Error(`Unknown module "${moduleId}".`);
  }

  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const order: ModuleDefinition[] = [];

  const visit = (currentId: string, stack: string[]) => {
    if (resolved.has(currentId)) {
      return;
    }

    if (visiting.has(currentId)) {
      throw new Error(
        `Dependency cycle detected: ${[...stack, currentId].join(" -> ")}`,
      );
    }

    const moduleDefinition = registry.get(currentId);
    if (!moduleDefinition) {
      throw new Error(`Missing dependency "${currentId}".`);
    }

    visiting.add(currentId);

    const dependencies = [...new Set(moduleDefinition.dependencies ?? [])].sort(
      (left, right) => left.localeCompare(right),
    );

    for (const dependencyId of dependencies) {
      if (!registry.has(dependencyId)) {
        throw new Error(
          `Module "${moduleDefinition.id}" depends on missing module "${dependencyId}".`,
        );
      }
      visit(dependencyId, [...stack, currentId]);
    }

    visiting.delete(currentId);
    resolved.add(currentId);
    order.push(moduleDefinition);
  };

  visit(moduleId, []);

  return order;
}
