# Project control documents

This directory is the durable source of truth for the California Lifestyle Income Planner MVP. It exists so that a developer or coding agent can resume work without reconstructing decisions from chat history.

## Read order

1. [`development-constraints.md`](development-constraints.md) — product, technical, cost, security, and design boundaries.
2. [`agent-constraints.md`](agent-constraints.md) — rules for agents changing this repository.
3. [`implementation-plan.md`](implementation-plan.md) — current phase, deliverables, exit criteria, and update log.

Phase 7 的固定浏览器矩阵、前端资源预算、隐私日志边界和 Firebase Spark 容量模型记录在
[`quality-security-performance.md`](quality-security-performance.md)。

The repository root [`AGENTS.md`](../../AGENTS.md) is the entry point for agents and makes this reading order mandatory.

## Current decision snapshot

- Product form: installable responsive PWA.
- Frontend: React, TypeScript, and Vite.
- Static hosting: GitHub Pages through a non-Actions publishing path first; Cloudflare Pages is the fallback.
- Authentication and cloud data: Firebase Authentication and Cloud Firestore on the Spark plan.
- Local operation: IndexedDB-backed local-first state and offline calculation.
- Cloud model: one versioned plan document per user for the MVP.
- Portability: domain-facing repository and authentication interfaces isolate Firebase.
- Visual baseline: the user-approved browser-width responsive three-column layout with pinned home, category view, persistent income panel, and seven themes; panels stack at 900 px and below.
- Typography: the final eleven-family theme mapping in `development-constraints.md` and its required glyph coverage must be preserved; Blue Midnight numbers use DM Serif Display.
- Tax scope: California W-2 planning estimate with supported filing statuses and explicit rule-year metadata.
- Active milestone: Phase 7.1 cross-phase stabilization is complete. Phase 8 release work may start only after explicit user authorization; production Firebase, deployment, and physical-device acceptance have not started.

## Document update policy

- Update the implementation plan after every material milestone or scope change.
- Keep the Chinese-first and English sections of `implementation-plan.md` semantically synchronized.
- Treat `npm run verify` as the authoritative quality gate; automatic GitHub Actions workflows remain disabled unless the user explicitly reverses this decision.
- Add a dated entry to its update log; do not rewrite history silently.
- If a decision changes a non-negotiable constraint, update both the relevant document and root `AGENTS.md`.
- When code and documentation disagree, stop and resolve the discrepancy before continuing dependent work.
- During Phase 7.1, completing one backlog item triggers a fresh review of the latest repository against every unresolved item. Update dependencies, priority, scope, and tests in the bilingual implementation plan before starting the next item whenever that review changes the plan.
