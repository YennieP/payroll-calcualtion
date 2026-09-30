# Development constraints

Last updated: 2026-09-30

## 1. MVP objective

Build an installable, responsive planner that answers: "If I want to fund these monthly life goals, how much gross income do I need in California?"

The MVP must work on phones and desktop computers, synchronize data between them for the same signed-in user, and remain usable locally when offline.

## 2. Product scope

### Required planning features

- Organize life goals into categories.
- Create, rename, order, move, and delete categories and goals.
- Edit each goal's name, monthly amount, budget mode, and pinned state.
- Use stable IDs for categories and goals; array indexes are not identities.
- Show category counts, category subtotals, the total monthly target, and pinned summaries.
- Provide a pinned home page and a category editing page.
- Search approximately 50 goals across categories and navigate to a result.
- Reveal long category lists progressively instead of rendering one wall of inputs.
- Provide useful empty, loading, offline, error, and conflict states.

### Required tax-planning features

- California is the only supported state in the MVP.
- Support Single, Married filing jointly, and Head of household.
- Accept monthly pretax deductions and a safety-buffer percentage.
- Estimate federal income tax, California income tax, Social Security, Medicare including Additional Medicare Tax, and California SDI.
- Reverse-solve the gross annual income required to meet the after-tax target.
- Show annual gross, monthly gross, estimated take-home, effective tax rate, goal total, buffer, and a detailed tax breakdown.
- Store tax-rule year, source metadata, and whether a rule set is a planning proxy.
- Clearly state that results are planning estimates and not professional tax advice.

### Required account and synchronization features

- Allow local use without an account.
- Support email/password authentication and password reset; Google sign-in may be added within MVP if configuration remains low-cost.
- Offer to import a local plan when a user first signs in.
- Synchronize the same account's plan between phone and desktop.
- Save locally first, then debounce cloud writes or save on field blur.
- Expose concise states for local changes, syncing, saved, offline, failed, and conflict.
- Use optimistic concurrency with `revision`, `updatedAt`, and `updatedByDevice`.
- Never silently overwrite a newer remote revision.
- Clear authenticated private cache on sign-out from a shared device.
- Support JSON export, import, and deletion of the user's plan.

## 3. Architecture constraints

- Use React, TypeScript in strict mode, and Vite.
- Use a PWA manifest and service worker for installation and offline assets.
- Use `npm run verify` as the single authoritative local quality-gate entry point.
- Keep the tax engine and plan-domain logic framework-independent and deterministic.
- Keep Firebase SDK imports inside `src/adapters/firebase/` and bootstrap configuration.
- Access persistence and authentication through interfaces defined under `src/ports/`.
- Use IndexedDB behind a local repository adapter for the canonical local cache and pending sync document.
- Keep derived totals and tax results out of persistent storage; recompute them from source inputs.
- Use one plan document per user for the MVP. Do not introduce Firestore subcollections without a demonstrated need.
- Use integer cents for money and basis points for percentages in the domain model.
- Include `schemaVersion` and tested forward migrations in every persisted plan.
- Use plain JSON-compatible domain values. Firestore `Timestamp`, `DocumentReference`, and sentinel values must not cross the adapter boundary.
- Avoid Cloud Functions and server-side tax computation in the MVP.

## 4. Visual and interaction constraints

- Treat the accepted demo as the source of truth for the desktop shell, navigation hierarchy, pinned screen, category screen, income panel, theme behavior, and general visual personality.
- Preserve all seven approved themes: Rouge Velvet, Blue Midnight, Violet/Amber, Violet/Crimson, Violet/Electric Blue, Gold Opera, and Scarlet Opera.
- Theme changes must not modify plan data, navigation data, pin state, or calculation results.
- Preserve the dark top bar, light or theme-specific center surface, side-panel relationships, and approved local gradient treatment.
- Keep top-bar controls visually balanced with the 34 px logo mark.
- The layout must remain clean with approximately 50 goals and must not clip, overlap, or overflow at supported widths.
- All visible primary controls must either work in the MVP or be removed before release; decorative dead controls are not allowed.
- Maintain keyboard access, visible focus, meaningful labels, and readable contrast in every theme.

## 5. Font constraints

The following demo font families are product assets and must be preserved:

- Bodoni Moda
- Cormorant Garamond
- Manrope
- Space Grotesk
- IBM Plex Sans SC
- Noto Serif SC
- ZCOOL XiaoWei
- ZCOOL QingKe HuangYou

Font delivery requirements:

- Self-host pinned WOFF2 files and their license texts.
- Preserve the exact family and required 400/500 weights used by the demo.
- Unicode-range splitting is allowed only when the complete required character coverage remains available.
- Do not create a static subset containing only the characters currently visible in the demo.
- Load the active theme's fonts first and cache remaining theme fonts during browser idle time.
- Verify all theme fonts offline and detect silent fallback in automated browser tests.
- Minor operating-system rasterization differences are acceptable; family, metrics, weight, wrapping, and layout must remain consistent.

## 6. Cost constraints

- Keep the Firebase project on the Spark plan during MVP development and early testing.
- Do not attach billing or enable a paid service without explicit user approval.
- Avoid phone/SMS authentication.
- Host static assets on GitHub Pages; use Cloudflare Pages only if GitHub Pages becomes unsuitable.
- Do not create or enable automatically triggered GitHub Actions workflows without explicit user approval; the user's shared Actions quota is already constrained by other projects.
- Do not use Firebase Storage for product assets.
- Debounce cloud writes and store the complete plan as one document to reduce reads and writes.
- Lazy-load and cache fonts; do not compromise font fidelity to reduce bandwidth.
- A custom domain is optional and outside the zero-cost baseline.

## 7. Security and privacy constraints

- Treat life-goal and income-planning data as private financial information.
- Firestore rules must deny access by default and restrict every plan path to the authenticated owner.
- Test rules with the Firebase Emulator Suite before deployment.
- Do not log full plan documents, tax inputs, email addresses, or authentication tokens.
- Do not commit `.env` files, service-account JSON, credentials, or private keys.
- Firebase client configuration is not an authorization boundary; security must be enforced by Authentication and Firestore rules.
- Avoid analytics and tracking in the MVP unless the user explicitly approves them.

## 8. Explicit non-goals

- Other US states.
- Self-employment, 1099, RSUs, bonuses, capital gains, itemized deductions, credits, and complex dependent calculations.
- Exact paycheck withholding simulation.
- Multi-user collaborative editing.
- Bank connections.
- AI-generated financial plans.
- App Store or Google Play distribution.
- Paid subscriptions and an operations dashboard.

## 9. Release quality gates

- Unit, integration, security-rule, end-to-end, visual-regression, and production-build checks pass.
- The applicable checks pass through the repository-owned local `npm run verify` entry point.
- The same test account synchronizes between two independent browser contexts.
- Offline edits survive reload and synchronize after reconnection.
- A stale revision cannot silently replace a newer cloud document.
- All seven themes render with their intended fonts and no fallback.
- Desktop, tablet, and phone layouts show no clipping or horizontal overflow with a 50-goal fixture.
- Tax assumptions and source years are visible and documented.
- The deployed PWA is installable and can reopen offline.
