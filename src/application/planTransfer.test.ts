import { describe, expect, it } from "vitest";

import { createSamplePlan } from "./samplePlan";
import { exportPlanJson, importPlanJson } from "./planTransfer";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

describe("plan JSON transfer", () => {
  it("round-trips a validated plan without losing source values", () => {
    const plan = createSamplePlan(DEVICE_ID);

    expect(importPlanJson(exportPlanJson(plan))).toEqual(plan);
  });

  it("rejects malformed JSON and unsupported plan documents with safe messages", () => {
    expect(() => importPlanJson("{not-json")).toThrow("文件不是有效的 JSON。");
    expect(() => importPlanJson('{"schemaVersion":99}')).toThrow(
      "文件不是可识别的 Worthwhile 计划，或版本暂不支持。",
    );
  });
});
