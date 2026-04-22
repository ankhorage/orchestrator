import { promises as fs } from "node:fs";
import path from "node:path";

import type { FileSystem } from "./types";

export class NodeFileSystem implements FileSystem {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }

  async writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async remove(targetPath: string): Promise<void> {
    await fs.rm(targetPath, { recursive: true, force: true });
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    const text = await this.readText(filePath);
    if (text === null) {
      return null;
    }

    return JSON.parse(text) as T;
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    const content = `${JSON.stringify(value, null, 2).replace(/\r\n/g, "\n")}\n`;
    await this.writeText(filePath, content);
  }

  async readDir(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return [];
    }
  }
}
