import { describe, expect, test } from 'bun:test';

import { defineModule, type ModuleAction } from '../src/index';
import { createTestOrchestrator } from './helpers';

interface MutableResourceConfig {
  readonly content: string;
  readonly fail?: boolean;
}

describe('reconfigure rollback', () => {
  test('restores the exact pre-reconfigure content of externally edited owned files', async () => {
    const moduleDefinition = defineModule<MutableResourceConfig>({
      id: 'mutable-resource',
      plan: ({ config }) => {
        const actions: ModuleAction[] = [
          {
            type: 'write-files',
            files: [
              {
                path: 'src/modules/example/resource.json',
                content: config.content,
                overwrite: true,
              },
            ],
          },
        ];
        if (config.fail) {
          actions.push({ type: 'ensure-packages', add: [{ name: 'failing-package' }] });
        }
        return actions;
      },
    });
    const { orchestrator, commandExecutor, fileSystem } = createTestOrchestrator({
      modules: [moduleDefinition],
    });
    const resourcePath = fileSystem.projectPath('src/modules/example/resource.json');

    await orchestrator.installModule('mutable-resource', {
      config: { content: '{"value":"installed"}\n' },
    });
    await fileSystem.writeText(resourcePath, '{"value":"author-edited"}\n');
    commandExecutor.failNext('bun', ['add', 'failing-package'], {
      code: 1,
      stdout: '',
      stderr: 'boom',
    });

    let failure: unknown;
    try {
      await orchestrator.reconfigureModule('mutable-resource', {
        config: { content: '{"value":"next"}\n', fail: true },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(await fileSystem.readText(resourcePath)).toBe('{"value":"author-edited"}\n');
    const state = await orchestrator.getModule('mutable-resource');
    expect(state?.installed ? state.installation.config : null).toEqual({
      content: '{"value":"installed"}\n',
    });
  });
});
