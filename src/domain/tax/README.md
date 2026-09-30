# Tax domain

Framework-independent TypeScript modules for California W-2 income planning.

- `engine.ts` estimates annual pay and reverse-solves the minimum gross income, to the cent, needed to cover a take-home target.
- `progressiveTax.ts` applies versioned marginal brackets.
- `rules/` stores tax data separately from algorithms, including source, applicable year, planning year, and proxy metadata.
- All money inputs and outputs are integer cents. Rates stored in rules use basis points.

The default `us-ca-w2-2026-v1` rule set uses federal and payroll assumptions for 2026. It deliberately identifies the official California 2025 resident schedule as a planning proxy for 2026; it must not be presented as a final California 2026 schedule.

The estimator assumes California W-2 wages, standard deductions, and no credits, dependants, itemized deductions, RSUs, bonuses, capital gains, or self-employment income. It is a planning estimate, not tax advice.
