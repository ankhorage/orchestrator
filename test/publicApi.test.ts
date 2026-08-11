import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createOrchestrator, defineModule, type ModuleState } from '../src/index';

describe('public module lifecycle API', () => {
  test('queries registered modules through the root export', async () => {
    const orchestrator = createOrchestrator({
      projectRoot: '/tmp/ankhorage-orchestrator-public-api-test',
      modules: [
        defineModule({
          id: 'example',
          version: '1.0.0',
          plan: () => [],
        }),
      ],
    });

    const states: readonly ModuleState[] = await orchestrator.listModules();

    expect(states).toEqual([
      {
        moduleId: 'example',
        available: true,
        installed: false,
        registration: { version: '1.0.0', dependencies: [] },
      },
    ]);
  });

  test('keeps the published package independent of Studio and UI runtimes', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const runtimePackages = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]);

    expect(runtimePackages.has('@ankhorage/studio')).toBe(false);
    expect(runtimePackages.has('@ankhorage/zora')).toBe(false);
    expect(runtimePackages.has('react')).toBe(false);
    expect(runtimePackages.has('react-native')).toBe(false);
  });
});
