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

The full command runs type checking, linting, formatting, unit tests, a production build, architecture-boundary checks, PWA artifact checks, and project-document checks. Later phases will extend the same entry point with Firebase Emulator, cross-device, offline, and visual-regression checks.
