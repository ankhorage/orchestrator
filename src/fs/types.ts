export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  readJson<T>(path: string): Promise<T | null>;
  writeJson(path: string, value: unknown): Promise<void>;
  readDir(path: string): Promise<string[]>;
}

export interface CommandExecutor {
  exec(cwd: string, command: string, args: string[]): Promise<CommandResult>;
}

export interface OrchestratorServices {
  fileSystem: FileSystem;
  commandExecutor: CommandExecutor;
  now?: () => string;
}
