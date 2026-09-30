# Versioned tax rules

Each file owns one dated rule source:

- `federal-2026.ts`: 2026 federal standard deductions and brackets.
- `california-2025.ts`: official 2025 California resident schedules, explicitly marked as a 2026 planning proxy.
- `us-ca-w2-2026.ts`: versioned registry entry combining income-tax schedules with 2026 Social Security, Medicare, Additional Medicare, and California SDI assumptions.

Do not silently edit a published constant. Add a new versioned rule-set ID, preserve its official source URL and year, and update tests and product-facing assumptions together.
