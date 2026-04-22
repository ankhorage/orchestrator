import type { ModuleAction } from "../actions/types";

export interface ModuleContext<TConfig = unknown> {
  projectRoot: string;
  moduleId: string;
  config: TConfig;
}

export interface ModuleDefinition<TConfig = unknown> {
  id: string;
  version?: string;
  dependencies?: string[];
  plan(
    context: ModuleContext<TConfig>,
  ): Promise<ModuleAction[]> | ModuleAction[];
}
