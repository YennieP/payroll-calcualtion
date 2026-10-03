# Test suites

Cross-module tests are organized here when they need a dedicated runtime:

- `integration/` for application and repository integration.
- `security/` for Firebase Emulator security rules.
- `e2e/` for browser, offline, and cross-device flows.
- `visual/` for theme, font, viewport, and 50-goal regression fixtures.

Firebase Auth/Firestore adapter and Rules coverage currently lives in `firebase/` and runs through `npm run test:firebase:emulator`. Real-Chrome PWA, font, visual/accessibility, IndexedDB recovery, and two-context synchronization checks live in `scripts/checks/` so they can share the production build or emulator lifecycle.

Small unit, component, repository-contract, and failure-injection tests remain beside their source modules under `src/`. `npm run verify` is the authoritative entry point for all of these suites.
