# California Lifestyle Income Planner

An installable, local-first planner that works backward from monthly life goals to an estimated gross income requirement for a California W-2 employee.

## Status

The accepted visual demo and legacy proof of concept are preserved under [`docs/reference`](docs/reference). Phases 1–7 and the Phase 7.1 cross-phase stabilization are complete, including the responsive planner, versioned California tax engine, local-first IndexedDB persistence, installable PWA, seven themes and eleven self-hosted font families, Firebase Authentication/Firestore adapters, and the authoritative local quality gate. Production Firebase configuration and deployment have not started.

Read [`AGENTS.md`](AGENTS.md) and the [`docs/project`](docs/project) control documents before making changes.

## Local development

Requirements:

- Node.js 22.12 or newer
- npm 10 or newer

```bash
npm install
npm run dev
```

## Quality checks

For normal development feedback:

```bash
npm run verify:quick
```

Before a milestone handoff, commit, or deployment:

```bash
npm run verify
```

These commands are the authoritative quality gate. Automatic GitHub Actions workflows are intentionally disabled to avoid consuming the account's shared CI quota. See [`scripts/README.md`](scripts/README.md).

## Architecture

- React + TypeScript + Vite
- Installable PWA shell
- Framework-independent plan and tax domain
- IndexedDB local repository adapter
- Firebase Authentication and Firestore behind portable interfaces
- Static hosting without automatic GitHub Actions

Production Firebase is intentionally not configured in the repository. The authoritative local gate uses the Auth and Firestore emulators, and the app remains fully usable in anonymous local mode when Firebase is absent. No billing-enabled services, Cloud Functions, SMS authentication, or Firebase Storage are required by the MVP.

## Tax model

- All source money values and calculation results use integer cents; percentages stored in plans use basis points.
- The current rule set is `us-ca-w2-2026-v1`.
- Federal and payroll assumptions apply to 2026.
- The official California 2025 resident schedule is explicitly used as a planning proxy for 2026.
- Results are California W-2 planning estimates, not professional tax advice.

See [`src/domain/tax/README.md`](src/domain/tax/README.md) for the implemented scope and limitations.

## Project references

- [Development constraints](docs/project/development-constraints.md)
- [Agent constraints](docs/project/agent-constraints.md)
- [Implementation plan](docs/project/implementation-plan.md)
- [Accepted demo](docs/reference/accepted-demo.html)
- [Archived legacy draft](docs/reference/legacy-draft)
