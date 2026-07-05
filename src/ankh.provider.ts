const ORCHESTRATOR_PACKAGE_NAME = '@ankhorage/orchestrator';
const ORCHESTRATOR_PACKAGE_VERSION = '0.2.2';
const ORCHESTRATOR_CATEGORY = 'orchestrator';

const ORCHESTRATOR_CAPABILITIES = [
  'orchestrator.modules',
  'orchestrator.install',
  'orchestrator.remove',
  'orchestrator.sync',
] as const;

const commands = [
  {
    path: ['module', 'list'],
    summary: 'List modules available to an orchestrator-backed host.',
    capability: 'orchestrator.modules',
    aliases: ['modules'],
    examples: ['ankh orchestrator module list'],
  },
  {
    path: ['module', 'install'],
    summary: 'Install a module through an orchestrator-backed host lifecycle.',
    capability: 'orchestrator.install',
    examples: ['ankh orchestrator module install expo-localization'],
  },
  {
    path: ['module', 'remove'],
    summary: 'Remove a module through an orchestrator-backed host lifecycle.',
    capability: 'orchestrator.remove',
    aliases: ['module uninstall'],
    examples: ['ankh orchestrator module remove expo-localization'],
  },
  {
    path: ['module', 'sync'],
    summary: 'Synchronize generated host artifacts after module lifecycle changes.',
    capability: 'orchestrator.sync',
    examples: ['ankh orchestrator module sync'],
  },
] as const;

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
  id: ORCHESTRATOR_PACKAGE_NAME,
  category: ORCHESTRATOR_CATEGORY,
  version: ORCHESTRATOR_PACKAGE_VERSION,
  capabilities: ORCHESTRATOR_CAPABILITIES,
  commands,
  handlers,
};

export default provider;
