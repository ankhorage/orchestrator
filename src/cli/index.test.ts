import { describe, expect, test } from 'bun:test';

import packageJson from '../../package.json';
import { CAPABILITIES } from '../capabilities/index.js';
import provider from './index';

describe('orchestrator Ankh provider', () => {
  test('declares coherent module lifecycle commands and handlers', () => {
    expect(provider.id).toBe('@ankhorage/orchestrator');
    expect(provider.category).toBe('orchestrator');
    expect(provider.version).toBe(packageJson.version);
    expect(provider.capabilities).toEqual(CAPABILITIES);

    const commandPaths = provider.commands.map((command) => command.path.join(' '));
    const handlerPaths = provider.handlers.map((handler) => handler.path.join(' '));

    expect(commandPaths).toEqual(['module list', 'module install', 'module remove']);
    expect(handlerPaths).toEqual(commandPaths);
    expect(provider.commands.map(({ capability }) => capability)).toEqual(
      CAPABILITIES.map(({ id }) => id),
    );
    const removeCommand = provider.commands.find(
      (command) => command.path.join(' ') === 'module remove',
    );
    expect(removeCommand).toHaveProperty('aliases', ['uninstall']);
    expect(JSON.stringify(packageJson.ankh)).toBe(
      JSON.stringify({
        category: 'orchestrator',
        provider: './dist/cli/index.js',
        capabilities: CAPABILITIES,
      }),
    );
  });
});
