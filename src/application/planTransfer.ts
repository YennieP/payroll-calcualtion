import { migratePlanDocument } from "../domain/plan";
import type { PlanDocument } from "../domain/plan";

export function exportPlanJson(plan: PlanDocument): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function importPlanJson(source: string): PlanDocument {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }

  try {
    return migratePlanDocument(value);
  } catch {
    throw new Error("文件不是可识别的 Worthwhile 计划，或版本暂不支持。");
  }
}
