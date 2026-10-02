# Local adapters

`LocalPlanRepository` is the local source of truth and stores each account's versioned plan together with its cloud-sync metadata in one IndexedDB record. Authenticated plan changes, pending revisions, and deletion intent therefore commit or roll back as one transaction. Database version 2 imports legacy sync metadata from `worthwhile-sync` once while preserving version-1 plan records. It also implements optimistic plan-revision checks before every write. Cloud flushes are serialized per account without blocking local commits. Their acknowledgement is a conditional atomic update: it clears only the pending revision that was actually uploaded and preserves a newer edit that landed while the request was in flight. UI and domain code never call IndexedDB directly.

`MemoryPlanRepository` implements the same plan and atomic-sync port for deterministic component and repository-contract tests.
