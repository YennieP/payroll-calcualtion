# Local adapters

`LocalPlanRepository` is the anonymous-mode source of truth and stores one versioned plan document per account key in IndexedDB. It implements optimistic revision checks before every write. UI and domain code never call IndexedDB directly.

`MemoryPlanRepository` implements the same port for deterministic component and repository-contract tests.
