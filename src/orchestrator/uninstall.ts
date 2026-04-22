import { removeTextBlock } from "../fs/patchTextBlock";
import { resolveProjectPath } from "../fs/paths";
import type { CommandExecutor, FileSystem } from "../fs/types";
import type { ModuleLedger } from "../ledger/types";

export async function uninstallFromLedger(args: {
  projectRoot: string;
  ledger: ModuleLedger;
  fileSystem: FileSystem;
  commandExecutor: CommandExecutor;
}): Promise<void> {
  const { projectRoot, ledger, fileSystem, commandExecutor } = args;
  const snapshotPaths = new Set(
    ledger.applied
      .filter(
        (
          operation,
        ): operation is Extract<
          typeof operation,
          { kind: "json-file-snapshot" }
        > => operation.kind === "json-file-snapshot",
      )
      .map((operation) => operation.path),
  );

  for (const operation of [...ledger.applied].reverse()) {
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
          await removeTextBlock({
            fileSystem,
            filePath: resolveProjectPath(projectRoot, operation.path),
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
            `Package uninstall failed for ${operation.name} (${ledger.moduleId}): ${
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
        if (snapshotPaths.has(operation.path)) {
          break;
        }
        break;
      }

      default: {
        const exhaustive: never = operation;
        return exhaustive;
      }
    }
  }
}
