import type { Capability } from '@ankhorage/contracts/capability';

/*** Publish Orchestrator's executable lifecycle operations for Ankh discovery and bindings. */
export const CAPABILITIES = [
  {
    id: 'orchestrator.modules',
    owner: '@ankhorage/orchestrator',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'List modules',
    description: 'List modules available to an orchestrator-backed host.',
  },
  {
    id: 'orchestrator.install',
    owner: '@ankhorage/orchestrator',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Install module',
    description: 'Install a module through an orchestrator-backed host lifecycle.',
  },
  {
    id: 'orchestrator.remove',
    owner: '@ankhorage/orchestrator',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Remove module',
    description: 'Remove a module through an orchestrator-backed host lifecycle.',
  },
] as const satisfies readonly Capability[];
