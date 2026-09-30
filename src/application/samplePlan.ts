import { DEFAULT_TAX_RULE_SET_ID } from "../domain/tax";
import type { BudgetMode, PlanDocument } from "../domain/plan";

interface SampleGoal {
  name: string;
  dollars: number;
  budgetMode: BudgetMode;
  pinned?: boolean;
}

interface SampleCategory {
  name: string;
  icon: string;
  goals: SampleGoal[];
}

const SAMPLE_CATEGORIES: SampleCategory[] = [
  {
    name: "居住",
    icon: "Ⅰ",
    goals: [
      { name: "房租", dollars: 3200, budgetMode: "monthly-fixed", pinned: true },
      { name: "水电煤气", dollars: 230, budgetMode: "monthly-variable" },
      { name: "网络与手机", dollars: 145, budgetMode: "monthly-fixed" },
      { name: "家具与维护", dollars: 175, budgetMode: "monthly-average" },
      { name: "租客保险", dollars: 42, budgetMode: "monthly-fixed" },
      { name: "清洁用品", dollars: 120, budgetMode: "monthly-average" },
      { name: "停车", dollars: 138, budgetMode: "monthly-fixed" },
      { name: "小型维修", dollars: 100, budgetMode: "monthly-average" },
    ],
  },
  {
    name: "日常生活",
    icon: "Ⅱ",
    goals: [
      { name: "餐饮", dollars: 720, budgetMode: "monthly-variable", pinned: true },
      { name: "通勤", dollars: 310, budgetMode: "monthly-fixed" },
      { name: "日用品", dollars: 240, budgetMode: "monthly-average" },
      { name: "健身运动", dollars: 120, budgetMode: "monthly-fixed" },
      { name: "咖啡", dollars: 85, budgetMode: "monthly-variable" },
      { name: "理发护理", dollars: 70, budgetMode: "monthly-average" },
      { name: "衣物", dollars: 60, budgetMode: "monthly-average" },
      { name: "交通补充", dollars: 45, budgetMode: "monthly-variable" },
      { name: "软件订阅", dollars: 40, budgetMode: "monthly-fixed" },
      { name: "书籍", dollars: 35, budgetMode: "monthly-average" },
      { name: "小食", dollars: 30, budgetMode: "monthly-variable" },
      { name: "杂项", dollars: 25, budgetMode: "monthly-average" },
    ],
  },
  {
    name: "家庭与责任",
    icon: "Ⅲ",
    goals: [
      { name: "家庭支持", dollars: 800, budgetMode: "monthly-fixed" },
      { name: "宠物", dollars: 180, budgetMode: "monthly-average" },
      { name: "礼物", dollars: 120, budgetMode: "monthly-average" },
      { name: "保险", dollars: 90, budgetMode: "monthly-fixed" },
      { name: "公益捐助", dollars: 35, budgetMode: "monthly-fixed" },
      { name: "家庭杂项", dollars: 25, budgetMode: "monthly-variable" },
    ],
  },
  {
    name: "旅行与体验",
    icon: "Ⅳ",
    goals: [
      { name: "旅行基金", dollars: 600, budgetMode: "monthly-fixed", pinned: true },
      { name: "演出活动", dollars: 160, budgetMode: "monthly-average" },
      { name: "周末出游", dollars: 140, budgetMode: "monthly-average" },
      { name: "兴趣课程", dollars: 90, budgetMode: "monthly-average" },
      { name: "博物馆", dollars: 30, budgetMode: "monthly-average" },
      { name: "电影", dollars: 25, budgetMode: "monthly-average" },
      { name: "短途交通", dollars: 25, budgetMode: "monthly-average" },
      { name: "户外活动", dollars: 20, budgetMode: "monthly-average" },
      { name: "摄影", dollars: 20, budgetMode: "monthly-average" },
      { name: "体验储备", dollars: 20, budgetMode: "monthly-average" },
    ],
  },
  {
    name: "储蓄与未来",
    icon: "Ⅴ",
    goals: [
      { name: "指数基金", dollars: 800, budgetMode: "monthly-fixed", pinned: true },
      { name: "应急储蓄", dollars: 900, budgetMode: "monthly-fixed" },
      { name: "购房基金", dollars: 200, budgetMode: "monthly-fixed" },
      { name: "学习基金", dollars: 50, budgetMode: "monthly-average" },
      { name: "退休补充", dollars: 30, budgetMode: "monthly-fixed" },
      { name: "职业培训", dollars: 30, budgetMode: "monthly-average" },
      { name: "设备更新", dollars: 30, budgetMode: "monthly-average" },
      { name: "长期旅行", dollars: 30, budgetMode: "monthly-average" },
      { name: "机会基金", dollars: 30, budgetMode: "monthly-average" },
    ],
  },
  {
    name: "其他",
    icon: "＋",
    goals: [
      { name: "订阅服务", dollars: 95, budgetMode: "monthly-fixed" },
      { name: "捐赠", dollars: 80, budgetMode: "monthly-fixed" },
      { name: "临时支出", dollars: 140, budgetMode: "monthly-average" },
      { name: "其他", dollars: 75, budgetMode: "monthly-average" },
      { name: "灵感预算", dollars: 100, budgetMode: "monthly-variable" },
    ],
  },
];

function sampleUuid(sequence: number): string {
  return `20000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`;
}

export function createSamplePlan(deviceId: string): PlanDocument {
  let nextId = 10;
  return {
    schemaVersion: 1,
    planId: sampleUuid(1),
    revision: 0,
    updatedAt: "2026-09-30T20:00:00.000Z",
    updatedByDevice: deviceId,
    taxProfile: {
      state: "CA",
      filingStatus: "single",
      monthlyPretaxDeductionCents: 50_000,
      bufferBasisPoints: 500,
      planningYear: 2026,
      taxRuleVersion: DEFAULT_TAX_RULE_SET_ID,
    },
    preferences: { themeId: "rouge" },
    categories: SAMPLE_CATEGORIES.map((category, categoryIndex) => ({
      id: sampleUuid(nextId++),
      name: category.name,
      icon: category.icon,
      order: categoryIndex,
      goals: category.goals.map((goal, goalIndex) => ({
        id: sampleUuid(nextId++),
        name: goal.name,
        monthlyAmountCents: goal.dollars * 100,
        budgetMode: goal.budgetMode,
        pinned: goal.pinned ?? false,
        order: goalIndex,
      })),
    })),
  };
}
