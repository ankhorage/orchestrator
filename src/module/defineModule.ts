import type { ModuleDefinition } from "./types";

export function defineModule<TConfig = unknown>(
  moduleDefinition: ModuleDefinition<TConfig>,
): ModuleDefinition<TConfig> {
  return moduleDefinition;
}
