import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConfig } from "@ankhorage/devtools/eslint";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir: configDir,
  project: ["./tsconfig.eslint.json"],
  files: ["src/**/*.ts", "test/**/*.ts"],
  allowDefaultProject: ["eslint.config.js"],
  additionalIgnores: ["dist/**", "coverage/**"],
});
