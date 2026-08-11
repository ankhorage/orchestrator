---
'@ankhorage/orchestrator': minor
---

Add deterministic module lifecycle queries and explicit reconfiguration. `listModules()` and `getModule()` now expose registered, installed, dependency, dependent, config, and unavailable-module state without UI concepts. Installing an already installed module now fails with guidance to use `reconfigureModule()`, which restores the previous ledger config and owned outputs when applying the new configuration fails.
