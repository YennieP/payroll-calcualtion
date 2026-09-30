import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateAnnualPay,
  progressiveTax,
  solveRequiredGross,
  TAX_DATA,
} from "../tax-engine.js";

test("progressiveTax taxes only the income inside each bracket", () => {
  const tax = progressiveTax(20000, [
    [10000, 0.1],
    [30000, 0.2],
    [Infinity, 0.3],
  ]);
  assert.equal(tax, 3000);
});

test("2026 federal standard deduction shields low income", () => {
  const result = estimateAnnualPay({
    grossIncome: TAX_DATA.federal.single.standardDeduction,
    filingStatus: "single",
    pretaxDeductions: 0,
  });
  assert.equal(result.taxes.federalIncomeTax, 0);
});

test("Social Security is capped at the 2026 wage base", () => {
  const atCap = estimateAnnualPay({ grossIncome: 184500, filingStatus: "single" });
  const aboveCap = estimateAnnualPay({ grossIncome: 300000, filingStatus: "single" });
  assert.equal(aboveCap.taxes.socialSecurity, atCap.taxes.socialSecurity);
});

test("additional Medicare tax applies above the filing-status threshold", () => {
  const atThreshold = estimateAnnualPay({ grossIncome: 200000, filingStatus: "single" });
  const aboveThreshold = estimateAnnualPay({ grossIncome: 210000, filingStatus: "single" });
  const expectedIncrease = 10000 * (0.0145 + 0.009);
  assert.ok(Math.abs(aboveThreshold.taxes.medicare - atThreshold.taxes.medicare - expectedIncrease) < 0.01);
});

test("inverse solver finds gross income that covers the take-home target", () => {
  const target = 8000 * 12;
  const result = solveRequiredGross({
    targetTakeHome: target,
    filingStatus: "single",
    pretaxDeductions: 500 * 12,
  });
  assert.ok(result.takeHome >= target);
  assert.ok(result.takeHome - target < 0.01);
});

test("married filing jointly needs less gross than single for the same target", () => {
  const target = 150000;
  const single = solveRequiredGross({ targetTakeHome: target, filingStatus: "single" });
  const married = solveRequiredGross({ targetTakeHome: target, filingStatus: "married" });
  assert.ok(married.grossIncome < single.grossIncome);
});
