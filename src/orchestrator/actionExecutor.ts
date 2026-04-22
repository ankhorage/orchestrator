import path from "node:path";

import { deepEqual, getAtPath, hasPath, setAtPath } from "../actions/jsonPath";
import type { JsonSetAction, ModuleAction } from "../actions/types";
import { insertTextBlock } from "../fs/patchTextBlock";
import { resolveProjectPath } from "../fs/paths";
import type { CommandExecutor, FileSystem } from "../fs/types";
import type { AppliedOperation } from "../ledger/types";

type JsonBuffer = Map<string, { doc: Record<string, unknown> }>;

export async function executeModuleActions(args: {
  projectRoot: string;
  actions: ModuleAction[];
  fileSystem: FileSystem;
  commandExecutor: CommandExecutor;
  moduleId: string;
}): Promise<AppliedOperation[]> {
  const { projectRoot, actions, fileSystem, commandExecutor, moduleId } = args;
  const applied: AppliedOperation[] = [];
  const jsonSnapshots = new Set<string>();
  const jsonBuffer: JsonBuffer = new Map();

  const flushJson = async () => {
    for (const [relativePath, value] of jsonBuffer.entries()) {
      const absolutePath = resolveProjectPath(projectRoot, relativePath);
      await fileSystem.writeJson(absolutePath, value.doc);
    }
    jsonBuffer.clear();
  };

  try {
    for (const action of actions) {
      switch (action.type) {
        case "write-files": {
          await flushJson();

          for (const file of action.files) {
            const absolutePath = resolveProjectPath(projectRoot, file.path);
            const prevContent = await fileSystem.readText(absolutePath);
            const exists = prevContent !== null;

            if (exists && !file.overwrite) {
              continue;
            }

            await fileSystem.ensureDir(path.dirname(absolutePath));
            await fileSystem.writeText(absolutePath, file.content);
            applied.push({
              kind: "file-write",
              path: file.path,
              prevContent,
            });
          }

          break;
        }

        case "patch-text-block": {
          await flushJson();

          const absolutePath = resolveProjectPath(projectRoot, action.path);
          const existed = await fileSystem.exists(absolutePath);
          await insertTextBlock({
            fileSystem,
            filePath: absolutePath,
            blockId: action.blockId,
            content: action.content,
            anchor: action.anchor,
          });

          applied.push({
            kind: "text-block-insert",
            path: action.path,
            blockId: action.blockId,
            created: !existed,
          });

          break;
        }

        case "json-set": {
          await stageJsonSet({
            action,
            projectRoot,
            fileSystem,
            jsonBuffer,
            jsonSnapshots,
            applied,
          });
          break;
        }

        case "ensure-packages": {
          await flushJson();

          for (const dependency of action.add) {
            const args = ["add"];
            if (dependency.dev) {
              args.push("-d");
            }
            args.push(
              `${dependency.name}${dependency.version ? `@${dependency.version}` : ""}`,
            );

            const result = await commandExecutor.exec(projectRoot, "bun", args);
            if (result.code !== 0) {
              throw new Error(
                `Package install failed for ${dependency.name} (${moduleId}): ${
                  result.stderr || result.stdout
                }`,
              );
            }

            applied.push({
              kind: "pkg-add",
              name: dependency.name,
              version: dependency.version,
              dev: dependency.dev,
            });
          }

          break;
        }

        default: {
          const exhaustive: never = action;
          return exhaustive;
        }
      }
    }

    await flushJson();
    return applied;
  } catch (error) {
    await flushJson();
    await rollbackAppliedOperations({
      projectRoot,
      applied,
      fileSystem,
      commandExecutor,
      moduleId,
    });
    throw error;
  }
}

async function rollbackAppliedOperations(args: {
  projectRoot: string;
  applied: AppliedOperation[];
  fileSystem: FileSystem;
  commandExecutor: CommandExecutor;
  moduleId: string;
}): Promise<void> {
  const { projectRoot, applied, fileSystem, commandExecutor, moduleId } = args;

  for (const operation of [...applied].reverse()) {
    switch (operation.kind) {
      case "file-write": {
        if (operation.prevContent === null) {
          await fileSystem.remove(
            resolveProjectPath(projectRoot, operation.path),
          );
        } else {
          await fileSystem.writeText(
            resolveProjectPath(projectRoot, operation.path),
            operation.prevContent,
          );
        }
        break;
      }

      case "text-block-insert": {
        if (operation.created) {
          await fileSystem.remove(
            resolveProjectPath(projectRoot, operation.path),
          );
        } else {
          const absolutePath = resolveProjectPath(projectRoot, operation.path);
          const { removeTextBlock } = await import("../fs/patchTextBlock");
          await removeTextBlock({
            fileSystem,
            filePath: absolutePath,
            blockId: operation.blockId,
          });
        }
        break;
      }

      case "pkg-add": {
        const result = await commandExecutor.exec(projectRoot, "bun", [
          "remove",
          operation.name,
        ]);
        if (result.code !== 0) {
          throw new Error(
            `Package uninstall failed for ${operation.name} (${moduleId}): ${
              result.stderr || result.stdout
            }`,
          );
        }
        break;
      }

      case "json-file-snapshot": {
        const absolutePath = resolveProjectPath(projectRoot, operation.path);
        if (operation.prevContent === null) {
          await fileSystem.remove(absolutePath);
        } else {
          await fileSystem.writeText(absolutePath, operation.prevContent);
        }
        break;
      }

      case "json-set": {
        break;
      }

      default: {
        const exhaustive: never = operation;
        return exhaustive;
      }
    }
  }
}

async function stageJsonSet(args: {
  action: JsonSetAction;
  projectRoot: string;
  fileSystem: FileSystem;
  jsonBuffer: JsonBuffer;
  jsonSnapshots: Set<string>;
  applied: AppliedOperation[];
}): Promise<void> {
  const {
    action,
    projectRoot,
    fileSystem,
    jsonBuffer,
    jsonSnapshots,
    applied,
  } = args;
  const absolutePath = resolveProjectPath(projectRoot, action.path);

  if (!jsonSnapshots.has(action.path)) {
    const prevContent = await fileSystem.readText(absolutePath);
    applied.push({
      kind: "json-file-snapshot",
      path: action.path,
      prevContent,
    });
    jsonSnapshots.add(action.path);
  }

  let buffer = jsonBuffer.get(action.path);
  if (!buffer) {
    const doc =
      (await fileSystem.readJson<Record<string, unknown>>(absolutePath)) ?? {};
    buffer = { doc };
    jsonBuffer.set(action.path, buffer);
  }

  const current = getAtPath(buffer.doc, action.jsonPath);
  if (action.expected !== undefined && !deepEqual(current, action.expected)) {
    throw new Error(
      `JSON path mismatch at ${action.path}:${action.jsonPath}. Expected ${JSON.stringify(
        action.expected,
      )}, found ${JSON.stringify(current)}`,
    );
  }

  const prev = current;
  const prevExists = hasPath(buffer.doc, action.jsonPath);
  buffer.doc = setAtPath(
    buffer.doc,
    action.jsonPath,
    action.value,
    action.createMissing ?? true,
  );

  applied.push({
    kind: "json-set",
    path: action.path,
    jsonPath: action.jsonPath,
    prevExists,
    prev,
    next: action.value,
  });
}
