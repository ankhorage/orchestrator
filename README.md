# orchestrator

A standalone, headless lifecycle engine for deterministic project modules.

## Features

- dependency-aware installation and removal
- canonical ledger-backed installed state and configuration
- deterministic registered/installed/dependent queries
- explicit reconfiguration with restoration of the previous state on failure
- no Studio, ZORA, React, or platform UI dependency

## Installation

```bash
bun add @ankhorage/orchestrator
```

## Usage

```ts
import { createOrchestrator, defineModule } from '@ankhorage/orchestrator';

const exampleModule = defineModule({
  id: 'example',
  version: '1.0.0',
  plan: ({ config }) => [
    {
      type: 'write-files',
      files: [
        {
          path: 'src/modules/example/config.json',
          content: `${JSON.stringify(config, null, 2)}\n`,
          overwrite: true,
        },
      ],
    },
  ],
});

const orchestrator = createOrchestrator({
  modules: [exampleModule],
  projectRoot: '/path/to/project',
});

await orchestrator.installModule('example', {
  config: { enabled: true },
});

await orchestrator.reconfigureModule('example', {
  config: { enabled: false },
});

const modules = await orchestrator.listModules();
const example = await orchestrator.getModule('example');

await orchestrator.removeModule('example');
```

`listModules()` includes both registered modules and installed ledger entries whose module package
is currently unavailable. Registration dependencies and installed dependent state are returned
separately so hosts can explain lifecycle constraints without inferring them from generated files.

Calling `installModule()` for an installed module is an error. Configuration changes use the
explicit `reconfigureModule()` operation, which updates the canonical ledger and module-owned
outputs together.
