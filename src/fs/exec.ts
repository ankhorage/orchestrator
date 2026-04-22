import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import type { CommandExecutor } from "./types";

const execFile = promisify(execFileCallback);

export class NodeCommandExecutor implements CommandExecutor {
  async exec(cwd: string, command: string, args: string[]) {
    try {
      const { stdout, stderr } = await execFile(command, args, { cwd });
      return { code: 0, stdout, stderr };
    } catch (error) {
      if (error instanceof Error) {
        return {
          code: 1,
          stdout: "",
          stderr: error.message,
        };
      }

      return {
        code: 1,
        stdout: "",
        stderr: "Unknown exec error",
      };
    }
  }
}
