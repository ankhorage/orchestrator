---
'@ankhorage/orchestrator': patch
---

Restore the exact pre-reconfiguration file contents when reconfiguration fails, so externally edited module-owned resources are not replaced by stale install-time ledger snapshots.
