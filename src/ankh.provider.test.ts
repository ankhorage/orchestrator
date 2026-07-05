import { describe, expect, test } from 'bun:test';

import provider from './ankh.provider';

describe('orchestrator Ankh provider', () => {
  test('declares coherent module lifecycle commands and handlers', () => {
    expect(provider.id).toBe('@ankhorage/orchestrator');
    expect(provider.category).toBe('orchestrator');
    expect(provider.capabilities).toEqual([
      'orchestrator.modules',
      'orchestrator.install',
      'orchestrator.remove',
      'orchestrator.sync',
    ]);

    const commandPaths = provider.commands.map((command) => command.path.join(' '));
    const handlerPaths = provider.handlers.map((handler) => handler.path.join(' '));

    expect(commandPaths).toEqual(['module list', 'module install', 'module remove', 'module sync']);
    expect(handlerPaths).toEqual(commandPaths);
  });
});
