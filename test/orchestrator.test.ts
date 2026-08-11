import { describe, expect, test } from 'bun:test';

import {
  defineModule,
  type ModuleDefinition,
  type ModuleInstallationState,
  type ModuleState,
} from '../src/index';
import { ledgerPath } from '../src/ledger/helpers';
import { createTestOrchestrator } from './helpers';

describe('createOrchestrator', () => {
  test('lists registered and installed module lifecycle state deterministically', async () => {
    const base = defineModule({
      id: 'base',
      version: '1.0.0',
      plan: () => [],
    });
    const feature = defineModule({
      id: 'feature',
      version: '2.0.0',
      dependencies: ['base', 'base'],
      plan: () => [],
    });
    const available = defineModule({
      id: 'available',
      dependencies: ['feature'],
      plan: () => [],
    });
    const { orchestrator } = createTestOrchestrator({
      modules: [feature, available, base],
      now: () => '2026-08-11T10:00:00.000Z',
    });

    await orchestrator.installModule('feature', { config: { enabled: true } });

    expect(await orchestrator.listModules()).toEqual([
      {
        moduleId: 'available',
        available: true,
        installed: false,
        registration: { version: undefined, dependencies: ['feature'] },
      },
      {
        moduleId: 'base',
        available: true,
        installed: true,
        registration: { version: '1.0.0', dependencies: [] },
        installation: {
          version: '1.0.0',
          installedAt: '2026-08-11T10:00:00.000Z',
          config: {},
          dependencies: [],
          dependents: ['feature'],
        },
      },
      {
        moduleId: 'feature',
        available: true,
        installed: true,
        registration: { version: '2.0.0', dependencies: ['base'] },
        installation: {
          version: '2.0.0',
          installedAt: '2026-08-11T10:00:00.000Z',
          config: { enabled: true },
          dependencies: ['base'],
          dependents: [],
        },
      },
    ]);
    expect(await orchestrator.getModule('feature')).toEqual((await orchestrator.listModules())[2]);
    expect(await orchestrator.getModule('missing')).toBeNull();
  });

  test('reports installed modules that are unavailable in the current registry', async () => {
    const moduleDefinition = defineModule({
      id: 'detached',
      version: '1.2.3',
      plan: () => [],
    });
    const { orchestrator, recreateOrchestrator } = createTestOrchestrator({
      modules: [moduleDefinition],
      now: () => '2026-08-11T10:00:00.000Z',
    });

    await orchestrator.installModule('detached', { config: { retained: true } });
    const withoutRegistration = recreateOrchestrator([]);

    expect(await withoutRegistration.listModules()).toEqual([
      {
        moduleId: 'detached',
        available: false,
        installed: true,
        installation: {
          version: '1.2.3',
          installedAt: '2026-08-11T10:00:00.000Z',
          config: { retained: true },
          dependencies: [],
          dependents: [],
        },
      },
    ]);
    expect(await withoutRegistration.removeModule('detached')).toEqual({
      removed: ['detached'],
    });
    expect(await withoutRegistration.listModules()).toEqual([]);
  });

  test('installs a module with dependencies and writes ledgers', async () => {
    const base = defineModule({
      id: 'base',
      plan: () => [
        {
          type: 'write-files',
          files: [
            {
              path: 'src/base.ts',
              content: 'export const base = true;\n',
              overwrite: true,
            },
          ],
        },
      ],
    });

    const feature = defineModule({
      id: 'feature',
      dependencies: ['base'],
      plan: () => [
        {
          type: 'write-files',
          files: [
            {
              path: 'src/feature.ts',
              content: 'export const feature = true;\n',
              overwrite: true,
            },
          ],
        },
      ],
    });

    const { orchestrator, fileSystem, projectRoot } = createTestOrchestrator({
      modules: [feature, base],
      now: () => '2026-04-22T12:00:00.000Z',
    });

    const result = await orchestrator.installModule('feature', {
      config: { enabled: true },
    });

    expect(result.installed).toEqual(['base', 'feature']);
    expect(fileSystem.snapshot()).toEqual({
      [`${projectRoot}/.ankh/ledger/base.json`]: `${JSON.stringify(
        {
          moduleId: 'base',
          installedAt: '2026-04-22T12:00:00.000Z',
          config: {},
          dependencies: [],
          actions: base.plan({ projectRoot, moduleId: 'base', config: {} }),
          applied: [{ kind: 'file-write', path: 'src/base.ts', prevContent: null }],
        },
        null,
        2,
      )}\n`,
      [`${projectRoot}/.ankh/ledger/feature.json`]: `${JSON.stringify(
        {
          moduleId: 'feature',
          installedAt: '2026-04-22T12:00:00.000Z',
          config: { enabled: true },
          dependencies: ['base'],
          actions: feature.plan({
            projectRoot,
            moduleId: 'feature',
            config: { enabled: true },
          }),
          applied: [{ kind: 'file-write', path: 'src/feature.ts', prevContent: null }],
        },
        null,
        2,
      )}\n`,
      [`${projectRoot}/src/base.ts`]: 'export const base = true;\n',
      [`${projectRoot}/src/feature.ts`]: 'export const feature = true;\n',
    });
  });

  test('fails install when a declared dependency is missing from the registry', async () => {
    const orphan = defineModule({
      id: 'orphan',
      dependencies: ['missing'],
      plan: () => [],
    });

    const { orchestrator } = createTestOrchestrator({
      modules: [orphan],
    });

    const error = await captureError(() => orchestrator.installModule('orphan', { config: {} }));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('depends on missing module "missing"');
  });

  test('blocks removal when another installed module depends on the target module', async () => {
    const shared = defineModule({
      id: 'shared',
      plan: () => [],
    });

    const dependent = defineModule({
      id: 'dependent',
      dependencies: ['shared'],
      plan: () => [],
    });

    const { orchestrator } = createTestOrchestrator({
      modules: [shared, dependent],
    });

    await orchestrator.installModule('dependent', { config: {} });

    const error = await captureError(() => orchestrator.removeModule('shared'));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'Cannot remove "shared" while installed modules still depend on it: dependent',
    );
  });

  test('removes a module immediately by replaying its ledger and deleting the ledger file', async () => {
    const moduleDefinition = defineModule({
      id: 'localization',
      plan: () => [
        {
          type: 'write-files',
          files: [
            {
              path: 'src/modules/localization/index.ts',
              content: 'export const locale = "en";\n',
              overwrite: true,
            },
          ],
        },
        {
          type: 'patch-text-block',
          path: 'app.config.ts',
          blockId: 'localization:config',
          content: '"expo-localization",',
          anchor: {
            find: 'plugins: [',
            position: 'after',
          },
        },
      ],
    });

    const { orchestrator, fileSystem, projectRoot } = createTestOrchestrator({
      modules: [moduleDefinition],
      now: () => '2026-04-22T12:00:00.000Z',
    });

    await fileSystem.writeText(
      fileSystem.projectPath('app.config.ts'),
      'export default { plugins: [\n] };\n',
    );
    await orchestrator.installModule('localization', { config: {} });
    await orchestrator.removeModule('localization');

    expect(fileSystem.snapshot()).toEqual({
      [`${projectRoot}/app.config.ts`]: 'export default { plugins: [\n] };\n',
    });
  });

  test('requires explicit reconfiguration and replaces config and owned outputs', async () => {
    const moduleDefinition = defineModule({
      id: 'settings',
      plan: ({ config }) => [
        {
          type: 'json-set',
          path: 'ankh.config.json',
          jsonPath: 'settings.theme',
          value: (config as { theme: string }).theme,
        },
      ],
    });

    const { orchestrator, fileSystem } = createTestOrchestrator({
      modules: [moduleDefinition],
      now: () => '2026-04-22T12:00:00.000Z',
    });

    await orchestrator.installModule('settings', {
      config: { theme: 'light' },
    });
    const duplicateInstallError = await captureError(() =>
      orchestrator.installModule('settings', { config: { theme: 'dark' } }),
    );
    expect((duplicateInstallError as Error).message).toContain('Use reconfigureModule()');

    const result = await orchestrator.reconfigureModule('settings', {
      config: { theme: 'dark' },
    });

    expect(result).toEqual({ installed: [], reconfigured: 'settings' });
    expect(await fileSystem.readText(fileSystem.projectPath('ankh.config.json'))).toBe(
      `${JSON.stringify({ settings: { theme: 'dark' } }, null, 2)}\n`,
    );
    expect(requireInstallation(await orchestrator.getModule('settings')).installedAt).toBe(
      '2026-04-22T12:00:00.000Z',
    );
  });

  test('rejects reconfiguration for unavailable or uninstalled modules', async () => {
    const available = defineModule({ id: 'available', plan: () => [] });
    const { orchestrator } = createTestOrchestrator({ modules: [available] });

    const uninstalledError = await captureError(() =>
      orchestrator.reconfigureModule('available', { config: {} }),
    );
    const unavailableError = await captureError(() =>
      orchestrator.reconfigureModule('missing', { config: {} }),
    );

    expect((uninstalledError as Error).message).toBe('Module "available" is not installed.');
    expect((unavailableError as Error).message).toBe('Unknown module "missing".');
  });

  test('fresh install failure rolls back partial work', async () => {
    const moduleDefinition = defineModule({
      id: 'failing',
      plan: () => [
        {
          type: 'write-files',
          files: [
            {
              path: 'src/setup.ts',
              content: 'export const ready = true;\n',
              overwrite: true,
            },
          ],
        },
        {
          type: 'ensure-packages',
          add: [{ name: 'left-pad' }],
        },
      ],
    });

    const { orchestrator, commandExecutor, fileSystem, projectRoot } = createTestOrchestrator({
      modules: [moduleDefinition],
    });

    commandExecutor.failNext('bun', ['add', 'left-pad'], {
      code: 1,
      stdout: '',
      stderr: 'boom',
    });

    const error = await captureError(() => orchestrator.installModule('failing', { config: {} }));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Package install failed for left-pad');

    expect(fileSystem.snapshot()).toEqual({});
    expect(await fileSystem.exists(fileSystem.projectPath(ledgerPath('failing')))).toBe(false);
    expect(projectRoot).toBe('/virtual/project');
  });

  test('failed reconfiguration restores the previous config and owned outputs', async () => {
    const moduleDefinition = defineModule({
      id: 'fonts',
      plan: ({ config }) => {
        const { font } = config as { font: string };
        return [
          {
            type: 'write-files' as const,
            files: [
              {
                path: 'src/fonts.ts',
                content: `export const font = "${font}";\n`,
                overwrite: true,
              },
            ],
          },
          ...(font === 'Roboto'
            ? [
                {
                  type: 'ensure-packages' as const,
                  add: [{ name: 'font-pkg' }],
                },
              ]
            : []),
        ];
      },
    });

    const { orchestrator, commandExecutor, fileSystem } = createTestOrchestrator({
      modules: [moduleDefinition],
    });

    await orchestrator.installModule('fonts', { config: { font: 'Inter' } });

    commandExecutor.failNext('bun', ['add', 'font-pkg'], {
      code: 1,
      stdout: '',
      stderr: 'nope',
    });

    const error = await captureError(() =>
      orchestrator.reconfigureModule('fonts', { config: { font: 'Roboto' } }),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Package install failed for font-pkg');

    expect(await fileSystem.readText(fileSystem.projectPath('src/fonts.ts'))).toBe(
      'export const font = "Inter";\n',
    );
    expect(requireInstallation(await orchestrator.getModule('fonts')).config).toEqual({
      font: 'Inter',
    });
  });

  test('reconfiguration installs newly declared dependencies before applying config', async () => {
    const base = defineModule({ id: 'base', plan: () => [] });
    const feature = defineModule({
      id: 'feature',
      dependencies: [] as string[],
      plan: () => [],
    });
    const { orchestrator } = createTestOrchestrator({ modules: [feature, base] });

    await orchestrator.installModule('feature', { config: { value: 1 } });
    feature.dependencies = ['base'];

    expect(await orchestrator.reconfigureModule('feature', { config: { value: 2 } })).toEqual({
      installed: ['base'],
      reconfigured: 'feature',
    });
    expect(requireInstallation(await orchestrator.getModule('feature')).dependencies).toEqual([
      'base',
    ]);
  });

  test('uses safe bun add and bun remove argument arrays', async () => {
    const moduleDefinition: ModuleDefinition = {
      id: 'deps',
      plan: () => [
        {
          type: 'ensure-packages',
          add: [{ name: '@scope/pkg', version: '^1.2.3', dev: true }, { name: 'plain-pkg' }],
        },
      ],
    };

    const { orchestrator, commandExecutor, projectRoot } = createTestOrchestrator({
      modules: [moduleDefinition],
    });

    await orchestrator.installModule('deps', { config: {} });
    await orchestrator.removeModule('deps');

    expect(commandExecutor.commands).toEqual([
      {
        cwd: projectRoot,
        command: 'bun',
        args: ['add', '-d', '@scope/pkg@^1.2.3'],
      },
      {
        cwd: projectRoot,
        command: 'bun',
        args: ['add', 'plain-pkg'],
      },
      {
        cwd: projectRoot,
        command: 'bun',
        args: ['remove', 'plain-pkg'],
      },
      {
        cwd: projectRoot,
        command: 'bun',
        args: ['remove', '@scope/pkg'],
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

function requireInstallation(state: ModuleState | null): ModuleInstallationState {
  if (!state?.installed) {
    throw new Error('Expected an installed module state.');
  }
  return state.installation;
}
