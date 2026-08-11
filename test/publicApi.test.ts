import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import * as publicApi from '../src/index';
import { createOrchestrator, defineModule, type ModuleState } from '../src/index';

describe('public module lifecycle API', () => {
  test('keeps ledger storage and operation contracts out of the published API', async () => {
    expect('LEDGER_DIR' in publicApi).toBe(false);
    expect('ledgerPath' in publicApi).toBe(false);

    const rootSource = await readFile(join(process.cwd(), 'src/index.ts'), 'utf8');
    for (const internalSymbol of ['LEDGER_DIR', 'ledgerPath', 'AppliedOperation', 'ModuleLedger']) {
      expect(rootSource).not.toContain(internalSymbol);
    }

    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>;
    };
    expect(Object.keys(packageJson.exports ?? {})).toEqual(['.']);
  });

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
