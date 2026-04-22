import { describe, expect, test } from "bun:test";

import { defineModule, type ModuleDefinition } from "../src/index";
import { ledgerPath } from "../src/ledger/helpers";
import { createTestOrchestrator } from "./helpers";

describe("createOrchestrator", () => {
  test("installs a module with dependencies and writes ledgers", async () => {
    const base = defineModule({
      id: "base",
      plan: () => [
        {
          type: "write-files",
          files: [
            {
              path: "src/base.ts",
              content: "export const base = true;\n",
              overwrite: true,
            },
          ],
        },
      ],
    });

    const feature = defineModule({
      id: "feature",
      dependencies: ["base"],
      plan: () => [
        {
          type: "write-files",
          files: [
            {
              path: "src/feature.ts",
              content: "export const feature = true;\n",
              overwrite: true,
            },
          ],
        },
      ],
    });

    const { orchestrator, fileSystem, projectRoot } = createTestOrchestrator({
      modules: [feature, base],
      now: () => "2026-04-22T12:00:00.000Z",
    });

    const result = await orchestrator.installModule("feature", {
      config: { enabled: true },
    });

    expect(result.installed).toEqual(["base", "feature"]);
    expect(fileSystem.snapshot()).toEqual({
      [`${projectRoot}/.ankh/ledger/base.json`]: `${JSON.stringify(
        {
          moduleId: "base",
          installedAt: "2026-04-22T12:00:00.000Z",
          config: {},
          dependencies: [],
          actions: base.plan({ projectRoot, moduleId: "base", config: {} }),
          applied: [
            { kind: "file-write", path: "src/base.ts", prevContent: null },
          ],
        },
        null,
        2,
      )}\n`,
      [`${projectRoot}/.ankh/ledger/feature.json`]: `${JSON.stringify(
        {
          moduleId: "feature",
          installedAt: "2026-04-22T12:00:00.000Z",
          config: { enabled: true },
          dependencies: ["base"],
          actions: feature.plan({
            projectRoot,
            moduleId: "feature",
            config: { enabled: true },
          }),
          applied: [
            { kind: "file-write", path: "src/feature.ts", prevContent: null },
          ],
        },
        null,
        2,
      )}\n`,
      [`${projectRoot}/src/base.ts`]: "export const base = true;\n",
      [`${projectRoot}/src/feature.ts`]: "export const feature = true;\n",
    });
  });

  test("fails install when a declared dependency is missing from the registry", async () => {
    const orphan = defineModule({
      id: "orphan",
      dependencies: ["missing"],
      plan: () => [],
    });

    const { orchestrator } = createTestOrchestrator({
      modules: [orphan],
    });

    const error = await captureError(() =>
      orchestrator.installModule("orphan", { config: {} }),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'depends on missing module "missing"',
    );
  });

  test("blocks removal when another installed module depends on the target module", async () => {
    const shared = defineModule({
      id: "shared",
      plan: () => [],
    });

    const dependent = defineModule({
      id: "dependent",
      dependencies: ["shared"],
      plan: () => [],
    });

    const { orchestrator } = createTestOrchestrator({
      modules: [shared, dependent],
    });

    await orchestrator.installModule("dependent", { config: {} });

    const error = await captureError(() => orchestrator.removeModule("shared"));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'Cannot remove "shared" while installed modules still depend on it: dependent',
    );
  });

  test("removes a module immediately by replaying its ledger and deleting the ledger file", async () => {
    const moduleDefinition = defineModule({
      id: "localization",
      plan: () => [
        {
          type: "write-files",
          files: [
            {
              path: "src/modules/localization/index.ts",
              content: 'export const locale = "en";\n',
              overwrite: true,
            },
          ],
        },
        {
          type: "patch-text-block",
          path: "app.config.ts",
          blockId: "localization:config",
          content: '"expo-localization",',
          anchor: {
            find: "plugins: [",
            position: "after",
          },
        },
      ],
    });

    const { orchestrator, fileSystem, projectRoot } = createTestOrchestrator({
      modules: [moduleDefinition],
      now: () => "2026-04-22T12:00:00.000Z",
    });

    await fileSystem.writeText(
      fileSystem.projectPath("app.config.ts"),
      "export default { plugins: [\n] };\n",
    );
    await orchestrator.installModule("localization", { config: {} });
    await orchestrator.removeModule("localization");

    expect(fileSystem.snapshot()).toEqual({
      [`${projectRoot}/app.config.ts`]: "export default { plugins: [\n] };\n",
    });
  });

  test("reinstall removes old state first and replaces the ledger on success", async () => {
    const moduleDefinition = defineModule({
      id: "settings",
      plan: ({ config }) => [
        {
          type: "json-set",
          path: "ankh.config.json",
          jsonPath: "settings.theme",
          value: (config as { theme: string }).theme,
        },
      ],
    });

    const { orchestrator, fileSystem } = createTestOrchestrator({
      modules: [moduleDefinition],
      now: () => "2026-04-22T12:00:00.000Z",
    });

    await orchestrator.installModule("settings", {
      config: { theme: "light" },
    });
    await orchestrator.installModule("settings", { config: { theme: "dark" } });

    expect(
      await fileSystem.readText(fileSystem.projectPath("ankh.config.json")),
    ).toBe(`${JSON.stringify({ settings: { theme: "dark" } }, null, 2)}\n`);
  });

  test("fresh install failure rolls back partial work", async () => {
    const moduleDefinition = defineModule({
      id: "failing",
      plan: () => [
        {
          type: "write-files",
          files: [
            {
              path: "src/setup.ts",
              content: "export const ready = true;\n",
              overwrite: true,
            },
          ],
        },
        {
          type: "ensure-packages",
          add: [{ name: "left-pad" }],
        },
      ],
    });

    const { orchestrator, commandExecutor, fileSystem, projectRoot } =
      createTestOrchestrator({
        modules: [moduleDefinition],
      });

    commandExecutor.failNext("bun", ["add", "left-pad"], {
      code: 1,
      stdout: "",
      stderr: "boom",
    });

    const error = await captureError(() =>
      orchestrator.installModule("failing", { config: {} }),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "Package install failed for left-pad",
    );

    expect(fileSystem.snapshot()).toEqual({});
    expect(
      await fileSystem.exists(fileSystem.projectPath(ledgerPath("failing"))),
    ).toBe(false);
    expect(projectRoot).toBe("/virtual/project");
  });

  test("reinstall failure leaves the previously installed module removed", async () => {
    const moduleDefinition = defineModule({
      id: "fonts",
      plan: ({ config }) => [
        {
          type: "write-files",
          files: [
            {
              path: "src/fonts.ts",
              content: `export const font = "${(config as { font: string }).font}";\n`,
              overwrite: true,
            },
          ],
        },
        {
          type: "ensure-packages",
          add: [{ name: "font-pkg" }],
        },
      ],
    });

    const { orchestrator, commandExecutor, fileSystem } =
      createTestOrchestrator({
        modules: [moduleDefinition],
      });

    await orchestrator.installModule("fonts", { config: { font: "Inter" } });

    commandExecutor.failNext("bun", ["add", "font-pkg"], {
      code: 1,
      stdout: "",
      stderr: "nope",
    });

    const error = await captureError(() =>
      orchestrator.installModule("fonts", { config: { font: "Roboto" } }),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "Package install failed for font-pkg",
    );

    expect(fileSystem.snapshot()).toEqual({});
  });

  test("uses safe bun add and bun remove argument arrays", async () => {
    const moduleDefinition: ModuleDefinition = {
      id: "deps",
      plan: () => [
        {
          type: "ensure-packages",
          add: [
            { name: "@scope/pkg", version: "^1.2.3", dev: true },
            { name: "plain-pkg" },
          ],
        },
      ],
    };

    const { orchestrator, commandExecutor, projectRoot } =
      createTestOrchestrator({
        modules: [moduleDefinition],
      });

    await orchestrator.installModule("deps", { config: {} });
    await orchestrator.removeModule("deps");

    expect(commandExecutor.commands).toEqual([
      {
        cwd: projectRoot,
        command: "bun",
        args: ["add", "-d", "@scope/pkg@^1.2.3"],
      },
      {
        cwd: projectRoot,
        command: "bun",
        args: ["add", "plain-pkg"],
      },
      {
        cwd: projectRoot,
        command: "bun",
        args: ["remove", "plain-pkg"],
      },
      {
        cwd: projectRoot,
        command: "bun",
        args: ["remove", "@scope/pkg"],
      },
    ]);
  });
});

async function captureError(factory: () => Promise<unknown>): Promise<unknown> {
  try {
    await factory();
    return null;
  } catch (error) {
    return error;
  }
}
