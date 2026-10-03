# Local verification

GitHub Actions are intentionally disabled to avoid consuming the account's CI quota. The repository uses local verification as the authoritative quality gate.

During development, run:

```bash
npm run verify:quick
```

Before a milestone handoff, commit, or deployment, run:

```bash
npm run verify
```

The full command runs type checking, linting, formatting, unit/component/Repository tests, font-asset checks, a production build, fail-closed performance and privacy budgets, architecture and PWA artifact checks, real-Chrome offline reopen/edit checks, seven-theme font/cache audits, 320–2000px extreme-content/accessibility checks, Firebase Auth/Firestore Emulator tests, independent desktop/phone synchronization, corrupt-cloud recovery, and project-document checks.

The Firebase step uses only the local `demo-worthwhile-local` emulator project. It does not connect to production, deploy rules, enable billing, or consume GitHub Actions quota.
