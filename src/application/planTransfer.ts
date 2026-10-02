import {
  getSerializedPlanByteLength,
  MAX_PLAN_UTF8_BYTES,
  migratePlanDocument,
  parsePlanDocument,
  PlanConstraintError,
  serializePlanDocument,
  utf8ByteLength,
} from "../domain/plan";
import type { PlanDocument } from "../domain/plan";

export function exportPlanJson(plan: PlanDocument): string {
  return serializePlanDocument(parsePlanDocument(plan));
}

export function importPlanJson(source: string): PlanDocument {
  if (utf8ByteLength(source) > MAX_PLAN_UTF8_BYTES) {
    throw new Error("计划文件超过 256 KiB，请精简名称或项目后重试。");
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }

  try {
    if (getSerializedPlanByteLength(value) > MAX_PLAN_UTF8_BYTES) {
      throw new PlanConstraintError([
        {
          path: "$",
          code: "plan_too_large",
          message: `Canonical plan JSON must not exceed ${MAX_PLAN_UTF8_BYTES} UTF-8 bytes.`,
        },
      ]);
    }
    return migratePlanDocument(value);
  } catch (error: unknown) {
    if (error instanceof PlanConstraintError) throw error;
    throw new Error("文件不是可识别的 Worthwhile 计划，或版本暂不支持。", {
      cause: error,
    });
  }
}
