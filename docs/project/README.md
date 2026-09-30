# Project control documents

This directory is the durable source of truth for the California Lifestyle Income Planner MVP. It exists so that a developer or coding agent can resume work without reconstructing decisions from chat history.

## Read order

1. [`development-constraints.md`](development-constraints.md) — product, technical, cost, security, and design boundaries.
2. [`agent-constraints.md`](agent-constraints.md) — rules for agents changing this repository.
3. [`implementation-plan.md`](implementation-plan.md) — current phase, deliverables, exit criteria, and update log.

The repository root [`AGENTS.md`](../../AGENTS.md) is the entry point for agents and makes this reading order mandatory.

## Current decision snapshot

- Product form: installable responsive PWA.
- Frontend: React, TypeScript, and Vite.
- Static hosting: GitHub Pages through a non-Actions publishing path first; Cloudflare Pages is the fallback.
- Authentication and cloud data: Firebase Authentication and Cloud Firestore on the Spark plan.
- Local operation: IndexedDB-backed local-first state and offline calculation.
- Cloud model: one versioned plan document per user for the MVP.
- Portability: domain-facing repository and authentication interfaces isolate Firebase.
- Visual baseline: the user-approved three-column demo with pinned home, category view, persistent income panel, and seven themes.
- Typography: all demo font families and required glyph coverage must be preserved.
- Tax scope: California W-2 planning estimate with supported filing statuses and explicit rule-year metadata.

## Document update policy

- Update the implementation plan after every material milestone or scope change.
- Keep the Chinese-first and English sections of `implementation-plan.md` semantically synchronized.
- Treat `npm run verify` as the authoritative quality gate; automatic GitHub Actions workflows remain disabled unless the user explicitly reverses this decision.
- Add a dated entry to its update log; do not rewrite history silently.
- If a decision changes a non-negotiable constraint, update both the relevant document and root `AGENTS.md`.
- When code and documentation disagree, stop and resolve the discrepancy before continuing dependent work.
