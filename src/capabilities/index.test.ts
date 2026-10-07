import { isCapability } from '@ankhorage/contracts/capabilities';
import { describe, expect, test } from 'bun:test';

import packageJson from '../../package.json';
import { CAPABILITIES } from './index.js';

describe('Orchestrator capabilities', () => {
  test('publishes unique canonical executable action targets', () => {
    expect(CAPABILITIES).toHaveLength(3);
    expect(CAPABILITIES.every(isCapability)).toBeTrue();
    expect(new Set(CAPABILITIES.map(({ id }) => id)).size).toBe(CAPABILITIES.length);
    for (const capability of CAPABILITIES) {
      expect(capability.owner).toBe('@ankhorage/orchestrator');
      expect(capability.access).toEqual(['invoke']);
      expect(capability.binding).toEqual({ kind: 'action', bindableAs: ['target'] });
    }
  });

  test('keeps package discovery metadata identical to the source catalog', () => {
    expect(JSON.stringify(packageJson.ankh.capabilities)).toBe(JSON.stringify(CAPABILITIES));
    expect(packageJson.ankh.capabilities.every(isCapability)).toBeTrue();
  });
});
