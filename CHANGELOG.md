# Changelog

## 0.3.0

### Minor Changes

- 182be7c: Add deterministic module lifecycle queries and explicit reconfiguration. `listModules()` and `getModule()` now expose registered, installed, dependency, dependent, config, and unavailable-module state without UI concepts. Installing an already installed module now fails with guidance to use `reconfigureModule()`, which restores the previous ledger config and owned outputs when applying the new configuration fails.

## 0.2.4

### Patch Changes

- 04f8ed5: Update package metadata.

## 0.2.3

### Patch Changes

- c117437: Expose orchestrator module lifecycle commands through an Ankh provider manifest.

## 0.2.2

### Patch Changes

- b502f8e: Update DEVTOOLS

## 0.2.1

### Patch Changes

- b202dde: add release workflow

## 0.2.0

### Minor Changes

- c713de6: Initial standalone orchestrator engine with module planning, dependency resolution, ledger-backed install and removal, and internal filesystem/package execution helpers.

### Patch Changes

- b819bed: update bun types
- f77c85d: Update the changeset config to make the repo access 'public'

## 0.1.2

### Patch Changes

- Add the first changelog entry and refresh the README with the current package positioning, usage snippet, and reversible-installation messaging.
