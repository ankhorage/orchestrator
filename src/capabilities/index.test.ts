import { areCapabilityCatalogsEqual, isCapabilityCatalog } from '@ankhorage/capability';
import { describe, expect, test } from 'bun:test';

import packageJson from '../../package.json';
import { CAPABILITIES } from './index.js';

describe('Orchestrator capabilities', () => {
  test('publishes a canonical executable action catalog', () => {
    expect(CAPABILITIES).toHaveLength(3);
    expect(isCapabilityCatalog(CAPABILITIES)).toBeTrue();
    for (const capability of CAPABILITIES) {
      expect(capability.owner).toBe('@ankhorage/orchestrator');
      expect(capability.access).toEqual(['invoke']);
      expect(capability.binding).toEqual({ kind: 'action', bindableAs: ['target'] });
    }
  });

  test('keeps package discovery metadata identical to the source catalog', () => {
    const packageCapabilities = packageJson.ankh.capabilities;

    expect(isCapabilityCatalog(packageCapabilities)).toBeTrue();
    if (!isCapabilityCatalog(packageCapabilities)) {
      throw new Error('Expected package capability metadata to be a valid capability catalog.');
    }
    expect(areCapabilityCatalogsEqual(packageCapabilities, CAPABILITIES)).toBeTrue();
  });
});
