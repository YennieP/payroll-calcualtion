# Repository instructions for coding agents

These instructions apply to the entire repository.

Before planning or changing code, read the following files in order:

1. `docs/project/README.md`
2. `docs/project/development-constraints.md`
3. `docs/project/agent-constraints.md`
4. `docs/project/implementation-plan.md`

## Non-negotiable project decisions

- The accepted frontend demo is the visual and interaction baseline. Do not redesign its information architecture or seven themes without explicit user approval.
- The product is a React + TypeScript + Vite PWA with Firebase Authentication and Firestore synchronization.
- Firebase must remain behind repository and authentication interfaces. Domain and UI code must not import Firebase SDK types.
- The application is local-first. Editing and California tax calculations must remain usable without a network connection.
- Preserve all font families used by the accepted demo. Optimization may change compression, Unicode-range packaging, loading, and caching, but may not remove required glyphs or substitute another family.
- Keep tax rules versioned and separate from the pure calculation engine. The MVP is a planning estimate, not tax advice.
- Keep the MVP within no-cost infrastructure where practical. Do not enable a paid Firebase plan, SMS authentication, Cloud Functions, Firebase Storage, paid hosting, or a paid external service without explicit user approval.
- Automatic GitHub Actions workflows are disabled to protect the user's shared CI quota. Do not add or enable one without explicit user approval.
- Never commit credentials, service-account files, private keys, or local environment files.

## Working rules

- Preserve user-authored and unrelated work in the working tree.
- Make changes in small, reviewable units and verify them in proportion to risk.
- Use `npm run verify:quick` during development and `npm run verify` before a milestone handoff, commit, or deployment.
- Update `docs/project/implementation-plan.md` whenever a milestone starts, completes, becomes blocked, or changes scope.
- Record material architecture or product-boundary changes in the project documents in the same change that implements them.
- Do not mark a phase complete until its listed exit criteria are satisfied.
- Do not deploy, enable billing, commit, or push unless the user has authorized that action.
