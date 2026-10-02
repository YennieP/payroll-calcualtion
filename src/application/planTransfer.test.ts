import { describe, expect, it } from "vitest";

import { createSamplePlan } from "./samplePlan";
import { exportPlanJson, importPlanJson } from "./planTransfer";
import { MAX_MONTHLY_GOAL_AMOUNT_CENTS, MAX_PLAN_UTF8_BYTES, utf8ByteLength } from "../domain/plan";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

describe("plan JSON transfer", () => {
  it("round-trips a validated plan without losing source values", () => {
    const plan = createSamplePlan(DEVICE_ID);
    const exported = exportPlanJson(plan);

    expect(exported).toBe(JSON.stringify(plan));
    expect(utf8ByteLength(exported)).toBeLessThanOrEqual(MAX_PLAN_UTF8_BYTES);
    expect(importPlanJson(exported)).toEqual(plan);
  });

  it("rejects malformed JSON and unsupported plan documents with safe messages", () => {
    expect(() => importPlanJson("{not-json")).toThrow("文件不是有效的 JSON。");
    expect(() => importPlanJson('{"schemaVersion":99}')).toThrow(
      "文件不是可识别的 Worthwhile 计划，或版本暂不支持。",
    );
  });

  it("rejects oversized source text before parsing and preserves specific limit messages", () => {
    expect(() => importPlanJson(" ".repeat(MAX_PLAN_UTF8_BYTES + 1))).toThrow(
      "计划文件超过 256 KiB",
    );

    const excessive = createSamplePlan(DEVICE_ID);
    excessive.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;
    expect(() => importPlanJson(JSON.stringify(excessive))).toThrow(
      "单个目标的每月金额不能超过 $500,000。",
    );
    expect(() => exportPlanJson(excessive)).toThrow("单个目标的每月金额不能超过 $500,000。");
  });
});
