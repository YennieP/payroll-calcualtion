import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MemoryPlanRepository } from "../adapters/local/MemoryPlanRepository";
import { createSamplePlan } from "../application/samplePlan";
import { updateGoal } from "../domain/plan";
import { App } from "./App";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

async function renderPlanner() {
  const repository = new MemoryPlanRepository();
  const user = userEvent.setup();
  render(<App repository={repository} deviceId={DEVICE_ID} />);
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  return { repository, user };
}

describe("local-first planner", () => {
  it("renders the accepted pinned home with a 50-goal sample plan", async () => {
    await renderPlanner();

    expect(screen.getByRole("heading", { name: "已置顶" })).toBeVisible();
    expect(screen.getByText("50 个目标")).toBeVisible();
    expect(screen.getByText("$10,900 / 月")).toBeVisible();
    expect(screen.getByRole("button", { name: /CA · Single/ })).toBeVisible();
  });

  it("hydrates saved goal values into inputs and derived totals", async () => {
    const repository = new MemoryPlanRepository();
    const sample = createSamplePlan(DEVICE_ID);
    const housing = sample.categories[0];
    const rent = housing.goals[0];
    const saved = updateGoal(
      sample,
      housing.id,
      rent.id,
      { monthlyAmountCents: 321_000 },
      { updatedAt: "2026-09-30T23:00:00.000Z", updatedByDevice: DEVICE_ID },
    );
    await repository.save("anonymous-local", saved, 0);

    render(<App repository={repository} deviceId={DEVICE_ID} />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

    expect(screen.getByRole("spinbutton", { name: "房租每月金额" })).toHaveValue(3210);
    expect(screen.getByText("$10,910 / 月")).toBeVisible();
  });

  it("navigates to a category and progressively reveals a long list", async () => {
    const { user } = await renderPlanner();

    await user.click(screen.getByRole("button", { name: /日常生活12 项/ }));
    expect(screen.getByRole("heading", { name: "日常生活" })).toBeVisible();
    expect(document.querySelectorAll(".goal-row")).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: "显示其余 6 个项目" }));
    expect(document.querySelectorAll(".goal-row")).toHaveLength(12);
  });

  it("searches across categories and navigates to the result source", async () => {
    const { user } = await renderPlanner();

    await user.type(screen.getByRole("searchbox", { name: "搜索目标" }), "旅行基金");
    expect(screen.getByRole("heading", { name: "搜索结果" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "旅行基金名称" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "旅行与体验 ↗" }));
    expect(screen.getByRole("heading", { name: "旅行与体验" })).toBeVisible();
  });

  it("updates a goal and immediately recalculates derived totals", async () => {
    const { user } = await renderPlanner();
    const amount = screen.getByRole("spinbutton", { name: "房租每月金额" });

    await user.clear(amount);
    await user.type(amount, "4000");
    await user.tab();

    expect(screen.getByText("$11,700 / 月")).toBeVisible();
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
  });

  it("edits tax settings, switches theme, and opens the detailed breakdown", async () => {
    const { user } = await renderPlanner();

    await user.click(screen.getByRole("button", { name: /CA · Single/ }));
    await user.selectOptions(screen.getByLabelText("报税身份"), "married");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1000" } });
    expect(screen.getByRole("button", { name: /CA · Married filing jointly/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /主题绯红绒/ }));
    const themeDialog = screen.getByRole("dialog", { name: "选择主题" });
    await user.click(within(themeDialog).getByRole("button", { name: /蓝午夜/ }));
    expect(document.querySelector(".planner-app")).toHaveAttribute("data-theme", "midnight");

    await user.click(screen.getByRole("button", { name: "查看完整税费 →" }));
    expect(screen.getByRole("dialog", { name: "完整税费明细" })).toBeVisible();
    expect(screen.getByText("Federal income tax")).toBeVisible();
    expect(screen.getByText(/California 2025 planning proxy/)).toBeVisible();
  });
});
