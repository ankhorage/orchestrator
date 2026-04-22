import path from "node:path";

import type {
  CommandExecutor,
  CommandResult,
  FileSystem,
  OrchestratorServices,
} from "../src/fs/types";
import type { ModuleDefinition } from "../src/module/types";
import { createOrchestratorWithServices } from "../src/orchestrator/createOrchestrator";

export interface RecordedCommand {
  cwd: string;
  command: string;
  args: string[];
}

export class MemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();

  constructor(private readonly projectRoot: string) {}

  exists(filePath: string): Promise<boolean> {
    return Promise.resolve(this.files.has(filePath));
  }

  readText(filePath: string): Promise<string | null> {
    return Promise.resolve(this.files.get(filePath) ?? null);
  }

  writeText(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
    return Promise.resolve();
  }

  ensureDir(_dirPath: string): Promise<void> {
    return Promise.resolve();
  }

  remove(targetPath: string): Promise<void> {
    for (const key of [...this.files.keys()]) {
      if (key === targetPath || key.startsWith(`${targetPath}${path.sep}`)) {
        this.files.delete(key);
      }
    }
    return Promise.resolve();
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    const text = await this.readText(filePath);
    return text === null ? null : (JSON.parse(text) as T);
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    await this.writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  readDir(dirPath: string): Promise<string[]> {
    const entries = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(`${dirPath}${path.sep}`)) {
        continue;
      }

      const relative = filePath.slice(dirPath.length + 1);
      const [entry] = relative.split(path.sep);
      if (entry) {
        entries.add(entry);
      }
    }

    return Promise.resolve(
      [...entries].sort((left, right) => left.localeCompare(right)),
    );
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(
      [...this.files.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  projectPath(relativePath: string): string {
    return path.resolve(this.projectRoot, relativePath);
  }
}

export class RecordingExecutor implements CommandExecutor {
  public readonly commands: RecordedCommand[] = [];
  private readonly failures = new Map<string, CommandResult>();

  exec(cwd: string, command: string, args: string[]): Promise<CommandResult> {
    this.commands.push({ cwd, command, args: [...args] });

    const key = JSON.stringify([command, ...args]);
    const failure = this.failures.get(key);
    if (failure) {
      return Promise.resolve(failure);
    }

    return Promise.resolve({
      code: 0,
      stdout: "",
      stderr: "",
    });
  }

  failNext(command: string, args: string[], result: CommandResult): void {
    this.failures.set(JSON.stringify([command, ...args]), result);
  }
}

export function createTestOrchestrator(args: {
  modules: ModuleDefinition[];
  projectRoot?: string;
  now?: () => string;
}) {
  const projectRoot = args.projectRoot ?? "/virtual/project";
  const fileSystem = new MemoryFileSystem(projectRoot);
  const commandExecutor = new RecordingExecutor();
  const services: OrchestratorServices = {
    fileSystem,
    commandExecutor,
    now: args.now,
  };

  const orchestrator = createOrchestratorWithServices(
    {
      modules: args.modules,
      projectRoot,
    },
    services,
  );

  return {
    orchestrator,
    fileSystem,
    commandExecutor,
    projectRoot,
  };
}
