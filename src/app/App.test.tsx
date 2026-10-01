import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MemoryPlanRepository } from "../adapters/local/MemoryPlanRepository";
import { createSamplePlan } from "../application/samplePlan";
import type { PlanDocument } from "../domain/plan";
import { updateGoal } from "../domain/plan";
import type { Account, AuthProvider } from "../ports/AuthProvider";
import type { CloudRuntime } from "../ports/CloudRuntime";
import type { RemotePlanRepository, RemoteSaveResult } from "../ports/RemotePlanRepository";
import { App } from "./App";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_DEVICE_ID = "30000000-0000-4000-8000-000000000002";
const ACCOUNT: Account = { id: "user-one", displayName: null, email: "planner@example.com" };

class FakeAuthProvider implements AuthProvider {
  private readonly listeners = new Set<(account: Account | null) => void>();

  constructor(private account: Account | null) {}

  currentAccount(): Account | null {
    return this.account;
  }

  async registerWithEmail(): Promise<Account> {
    this.setAccount(ACCOUNT);
    return ACCOUNT;
  }

  async signInWithEmail(): Promise<Account> {
    this.setAccount(ACCOUNT);
    return ACCOUNT;
  }

  async sendPasswordResetEmail(): Promise<void> {}

  async signOut(): Promise<void> {
    this.setAccount(null);
  }

  onAuthChange(listener: (account: Account | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.account);
    return () => this.listeners.delete(listener);
  }

  private setAccount(account: Account | null) {
    this.account = account;
    this.listeners.forEach((listener) => listener(account));
  }
}

class FakeRemotePlanRepository implements RemotePlanRepository {
  private readonly plans = new Map<string, PlanDocument>();
  private readonly listeners = new Map<string, Set<(plan: PlanDocument) => void>>();

  async load(accountId: string): Promise<PlanDocument | null> {
    return this.plans.get(accountId) ?? null;
  }

  async push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult> {
    const remote = this.plans.get(accountId);
    if ((remote?.revision ?? 0) !== expectedRemoteRevision) {
      if (!remote) throw new Error("Missing conflict plan.");
      return { status: "conflict", remote };
    }
    this.seed(accountId, plan);
    return { status: "saved", revision: plan.revision };
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void {
    const listeners = this.listeners.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.listeners.set(accountId, listeners);
    return () => listeners.delete(onRemoteChange);
  }

  async delete(accountId: string): Promise<void> {
    this.plans.delete(accountId);
  }

  seed(accountId: string, plan: PlanDocument) {
    this.plans.set(accountId, plan);
    this.listeners.get(accountId)?.forEach((listener) => listener(plan));
  }
}

function createCloudRuntime(account: Account | null = ACCOUNT) {
  const auth = new FakeAuthProvider(account);
  const plans = new FakeRemotePlanRepository();
  return { runtime: { auth, plans } satisfies CloudRuntime, auth, plans };
}

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

  it("offers an explicit first-login import and moves the anonymous plan to the cloud", async () => {
    const repository = new MemoryPlanRepository();
    const anonymousPlan = { ...createSamplePlan(DEVICE_ID), revision: 1 };
    await repository.replace("anonymous-local", anonymousPlan);
    const { runtime, plans } = createCloudRuntime();
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "导入这台设备的计划？" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "导入本机计划" }));
    await screen.findByRole("heading", { name: "已置顶" });

    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({ planId: anonymousPlan.planId });
    await expect(repository.load("anonymous-local")).resolves.toBeNull();
  });

  it("downloads a newer cloud plan into an empty device cache", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    const sample = createSamplePlan(OTHER_DEVICE_ID);
    const housing = sample.categories[0];
    const rent = housing.goals[0];
    const remotePlan = {
      ...updateGoal(
        sample,
        housing.id,
        rent.id,
        { monthlyAmountCents: 456_700 },
        { updatedAt: "2026-10-01T20:00:00.000Z", updatedByDevice: OTHER_DEVICE_ID },
      ),
      revision: 3,
    };
    plans.seed(ACCOUNT.id, remotePlan);
    expect(remotePlan.categories[0].goals[0].monthlyAmountCents).toBe(456_700);

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: "房租每月金额" })).toHaveValue(4567),
    );
    await expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 3 });
  });

  it("keeps an empty signed-in starting plan local until the first edit", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    await screen.findByRole("heading", { name: "已置顶" });
    await waitFor(() =>
      expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 0 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    await expect(plans.load(ACCOUNT.id)).resolves.toBeNull();
  });

  it("clears the authenticated cache on sign-out without deleting the cloud plan", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    const remotePlan = { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 };
    plans.seed(ACCOUNT.id, remotePlan);
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    await screen.findByRole("heading", { name: "已置顶" });
    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    await screen.findByRole("button", { name: /跨设备同步/ });

    await expect(repository.load(ACCOUNT.id)).resolves.toBeNull();
    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 });
  });

  it("shows a two-device revision conflict and can keep the current local edit", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    const seed = { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 };
    plans.seed(ACCOUNT.id, seed);
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    await user.clear(amount);
    await user.type(amount, "4100");
    await user.tab();
    expect(amount).toHaveValue(4100);
    await waitFor(() => expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 2 }));
    const refreshedAmount = screen.getByRole("spinbutton", { name: "房租每月金额" });
    fireEvent.change(refreshedAmount, { target: { value: "4200" } });
    fireEvent.blur(refreshedAmount);
    await act(async () => {
      plans.seed(ACCOUNT.id, {
        ...seed,
        revision: 3,
        updatedAt: "2026-10-01T20:10:00.000Z",
        updatedByDevice: OTHER_DEVICE_ID,
      });
      await Promise.resolve();
    });

    expect(await screen.findByText("检测到另一份较新的计划版本")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "保留当前修改" }));
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
      revision: 4,
      updatedByDevice: DEVICE_ID,
    });
  });
});
