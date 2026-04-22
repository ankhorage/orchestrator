import type { FileSystem } from "./types";

interface PatchAnchor {
  find: string;
  position: "before" | "after";
}

function startMarker(blockId: string): string {
  return `// @ankh:block ${blockId}:start`;
}

function endMarker(blockId: string): string {
  return `// @ankh:block ${blockId}:end`;
}

export async function insertTextBlock(args: {
  fileSystem: FileSystem;
  filePath: string;
  blockId: string;
  content: string;
  anchor?: PatchAnchor;
}): Promise<void> {
  const { fileSystem, filePath, blockId, content, anchor } = args;
  const existing = (await fileSystem.readText(filePath)) ?? "";
  const start = startMarker(blockId);

  if (existing.includes(start)) {
    return;
  }

  const block = `${start}\n${content}\n${endMarker(blockId)}`;

  if (anchor) {
    const index = existing.indexOf(anchor.find);
    if (index !== -1) {
      const insertAt =
        anchor.position === "after" ? index + anchor.find.length : index;
      const before = existing.slice(0, insertAt);
      const after = existing.slice(insertAt);
      const prefix = before.endsWith("\n") || before.length === 0 ? "" : "\n";
      const suffix = after.startsWith("\n") || after.length === 0 ? "" : "\n";
      const next = `${before}${prefix}${block}${suffix}${after}`;
      await fileSystem.writeText(filePath, next);
      return;
    }
  }

  const prefix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  await fileSystem.writeText(filePath, `${existing}${prefix}${block}\n`);
}

export async function removeTextBlock(args: {
  fileSystem: FileSystem;
  filePath: string;
  blockId: string;
}): Promise<void> {
  const { fileSystem, filePath, blockId } = args;
  const existing = await fileSystem.readText(filePath);

  if (existing === null) {
    return;
  }

  const start = escapeForRegex(startMarker(blockId));
  const end = escapeForRegex(endMarker(blockId));
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}\\n?`, "g");
  const next = existing.replace(pattern, "");
  await fileSystem.writeText(filePath, next);
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
