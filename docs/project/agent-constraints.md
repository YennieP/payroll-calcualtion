# Agent constraints

Last updated: 2026-09-30

## 1. Required preparation

Before changing the repository, an agent must:

1. Read root `AGENTS.md` and every document referenced by it.
2. Inspect the current working tree and preserve unrelated or user-authored changes.
3. Read the current phase and exit criteria in `implementation-plan.md`.
4. State the intended scope before making material changes.

## 2. Scope discipline

- Implement only the active milestone unless a prerequisite is required.
- Do not add speculative features from the explicit non-goal list.
- Do not redesign the accepted UI, rename themes, replace fonts, or change the information architecture without explicit user approval.
- Do not silently replace a tax assumption or source year. Update documentation and tests together with any tax-rule change.
- Do not enable billing, paid services, SMS authentication, external analytics, deployment, commit, or push without the appropriate user authorization.
- Do not create or enable an automatically triggered GitHub Actions workflow without explicit user approval.
- Do not expose secrets in code, command output, screenshots, logs, or documentation.

## 3. Architectural boundaries

- `src/domain/` must not import React, Firebase, browser globals, or persistence libraries.
- `src/application/` may depend on domain types and ports, not concrete Firebase adapters.
- Firebase SDK calls and Firebase-specific types belong only in `src/adapters/firebase/` and minimal application bootstrap wiring.
- UI components dispatch domain actions and consume selectors; they do not calculate taxes independently.
- Derived totals and tax results must not be saved as source-of-truth data.
- Persisted data changes require a schema-version update or an explicit compatibility decision.
- Every persistence adapter must satisfy the same repository contract tests.

## 4. Change discipline

- Prefer small, focused files and patches over monolithic rewrites.
- Preserve stable IDs and user data across refactors.
- Treat the current uncommitted draft as user-owned input until its useful tax logic has been deliberately migrated.
- Preserve the accepted demo as a reference artifact before replacing the draft UI.
- Add or update tests in the same change as behavior.
- Keep generated build output, Firebase local state, credentials, and environment files out of version control.

## 5. Verification expectations

Choose checks proportional to the change, including as applicable:

- `npm run verify:quick` for development feedback.
- `npm run verify` before a milestone handoff, commit, or deployment.

- TypeScript type checking.
- Lint and formatting checks.
- Tax and domain unit tests.
- Reducer, selector, validation, and migration tests.
- Local and Firebase repository contract tests.
- Firestore Emulator security-rule tests.
- Two-browser-context synchronization tests.
- Offline, reconnect, and revision-conflict tests.
- Visual regression for all themes and supported viewport groups.
- A 50-goal layout fixture with overflow assertions.
- Production build and PWA installability checks.

Do not report a phase as complete when a required check was skipped. Report the skipped check and reason instead.

## 6. Plan maintenance

After a material work unit, update `implementation-plan.md`:

- Update both its Chinese-first and English sections in the same change.
- Change phase status only when its exit criteria are met.
- Record the date, scope, validation evidence, and remaining risks.
- Add newly discovered blockers rather than hiding them in prose.
- Keep the next executable step explicit.
- Do not delete prior update-log entries; correct them with a new dated entry.
- During a cross-phase stabilization backlog, finish only one review unit at a time. After its implementation and focused checks, inspect the latest repository state against every unresolved backlog item before starting another unit. Record any changed dependency, priority, scope, acceptance criterion, or test plan in both language sections and the update log.

## 7. Handoff requirements

A handoff must identify:

- Current branch and working-tree state.
- Active milestone and next step.
- Files changed.
- Tests run and their results.
- Tests not run and why.
- Firebase or deployment state, if relevant.
- Known risks or decisions still awaiting the user.
