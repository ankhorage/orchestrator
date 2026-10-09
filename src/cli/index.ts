import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';
import type { Capability } from '@ankhorage/contracts/capability';
import type { AnkhCommandDescriptor } from '@ankhorage/contracts/cli';

import packageJson from '../../package.json';
import { CAPABILITIES } from '../capabilities/index.js';

const commands = [
  {
    path: ['module', 'list'],
    summary: 'List modules available to an orchestrator-backed host.',
    capability: 'orchestrator.modules' satisfies Capability['id'],
    aliases: ['modules'],
    examples: ['ankh orchestrator module list'],
  },
  {
    path: ['module', 'install'],
    summary: 'Install a module through an orchestrator-backed host lifecycle.',
    capability: 'orchestrator.install' satisfies Capability['id'],
    examples: ['ankh orchestrator module install expo-localization'],
  },
  {
    path: ['module', 'remove'],
    summary: 'Remove a module through an orchestrator-backed host lifecycle.',
    capability: 'orchestrator.remove' satisfies Capability['id'],
    aliases: ['uninstall'],
    examples: ['ankh orchestrator module remove expo-localization'],
  },
] as const satisfies readonly AnkhCommandDescriptor[];

const handlers = commands.map((command) => ({
  path: command.path,
  handler(request: {
    readonly context: {
      writeStdout(text: string): void;
    };
  }) {
    request.context.writeStdout(
      `${command.path.join(' ')} is provided as an orchestrator lifecycle capability. ` +
        'Host packages wire concrete module catalogs and project targets.\n',
    );
    return { exitCode: 0 };
  },
}));

const provider = {
  id: '@ankhorage/orchestrator',
  category: 'orchestrator',
  version: packageJson.version,
  capabilities: CAPABILITIES,
  commands,
  handlers,
} as const satisfies AnkhRuntimeCommandProvider;

export default provider;
