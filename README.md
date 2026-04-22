# @ankhorage/orchestrator

`@ankhorage/orchestrator` is the standalone engine extracted and redesigned from the relevant contract and execution concepts in `../ankhorage4/packages/plugin-kit` and the CLI runtime helpers.

The package has one job: execute module plans against a project root, track the applied work in `.ankh/ledger/<moduleId>.json`, and reverse that work deterministically on removal.

## Architecture

- Orchestrator: owns the loaded module registry, resolves dependencies, installs modules, removes modules, and writes the ledger.
- Modules: pure planners that return actions from `plan(ctx)`.
- Host: loads module definitions, gathers config, and triggers `installModule` / `removeModule`.

The orchestrator does not know templates, UI, Studio, Expo layout generation, or runtime-specific behavior.

## Public API

```ts
import { createOrchestrator, defineModule } from "@ankhorage/orchestrator";

const localizationModule = defineModule({
  id: "expo-localization",
  dependencies: ["base-i18n"],
  async plan(ctx) {
    return [
      {
        type: "write-files",
        files: [
          {
            path: "src/modules/localization/index.ts",
            content: "export const ready = true;\n",
            overwrite: true,
          },
        ],
      },
    ];
  },
});

const orchestrator = createOrchestrator({
  modules: [localizationModule],
  projectRoot: "/absolute/path/to/project",
});

await orchestrator.installModule("expo-localization", {
  config: { defaultLocale: "en" },
});

await orchestrator.removeModule("expo-localization");
```

### Module contract

```ts
defineModule({
  id: string,
  version?: string,
  dependencies?: string[],
  plan(ctx): ModuleAction[] | Promise<ModuleAction[]>
})
```

`plan(ctx)` receives:

- `projectRoot`
- `moduleId`
- `config`

The host only passes `config`; the orchestrator injects the rest.

### Supported actions

V1 supports exactly these actions:

- `ensure-packages`
- `write-files`
- `json-set`
- `patch-text-block`

Package execution is internal infrastructure only. The orchestrator uses safe `bun add` / `bun remove` argument arrays under `src/fs/exec.ts` and does not expose an adapter API.

## Ledger behavior

Each installed module writes `.ankh/ledger/<moduleId>.json`.

Every ledger entry stores:

- `moduleId`
- `moduleVersion`
- `installedAt`
- `config`
- `dependencies`
- `actions`
- `applied`

The `applied` section is the source of truth for rollback. Removal never recomputes a module plan.

## Install and remove semantics

- Dependency resolution belongs to the orchestrator, not the host.
- Missing declared dependencies fail the install before any execution starts.
- Dependencies are installed before the requested module.
- Removal is immediate. The orchestrator reads the ledger, replays rollback operations, and deletes the ledger file.
- Removal is blocked if another installed module still depends on the target module.

### Replace-style reinstall

If `installModule()` is called for a module that is already installed, the orchestrator removes the existing installed state first and then runs the new plan.

This behavior is intentional in v1 and has an important consequence:

- if the reinstall fails after the prior state was removed, the module remains removed

Fresh installs behave differently:

- if a fresh install fails part-way through, the orchestrator rolls back the new partial work and leaves no orchestrator-managed residue behind

## Development

This repo uses:

- `@ankhorage/devtools` for lint and prettier alignment
- `@changesets/cli` for versioning

Run the quality gates with:

```sh
bun install
bun run build
bun run lint
bun run test
bunx knip
```

## Repo-switch rule

Work in this repo stops once the orchestrator package is release-ready.

Module extraction must happen later in dedicated repos such as `@ankhorage/orchestrator-module-expo-localization`. When that work starts, the current repo is no longer the right place to continue. The next step must be an explicit repository switch request before any module-repo changes are made.

