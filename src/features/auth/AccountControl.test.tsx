import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import { MAX_MONTHLY_GOAL_AMOUNT_CENTS } from "../../domain/plan";
import type { Account, AuthProvider } from "../../ports/AuthProvider";
import { AccountControl } from "./AccountControl";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";
const ACCOUNT: Account = { id: "user-one", displayName: null, email: "planner@example.com" };
const PLAN = createSamplePlan(DEVICE_ID);

const DATA_PROPS = {
  saveStatus: "saved" as const,
  plan: PLAN,
  onImportPlan: vi.fn(async () => undefined),
  onDeletePlan: vi.fn(async () => undefined),
};

function createAuthProvider(): AuthProvider {
  return {
    currentAccount: () => null,
    registerWithEmail: vi.fn(async () => ACCOUNT),
    signInWithEmail: vi.fn(async () => ACCOUNT),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    onAuthChange: vi.fn(() => () => undefined),
  };
}

describe("AccountControl", () => {
  it("supports email registration and password reset without exposing raw provider errors", async () => {
    const provider = createAuthProvider();
    const user = userEvent.setup();
    render(
      <AccountControl
        provider={provider}
        account={null}
        sync={null}
        onSignOut={vi.fn(async () => undefined)}
        {...DATA_PROPS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /跨设备同步/ }));
    await user.click(screen.getByRole("tab", { name: "注册" }));
    await user.type(screen.getByLabelText("邮箱"), "planner@example.com");
    await user.type(screen.getByLabelText("密码"), "secret12");
    await user.click(screen.getByRole("button", { name: "创建账户" }));
    expect(provider.registerWithEmail).toHaveBeenCalledWith("planner@example.com", "secret12");

    await user.click(screen.getByRole("button", { name: /跨设备同步/ }));
    await user.click(screen.getByRole("tab", { name: "重置密码" }));
    await user.click(screen.getByRole("button", { name: "发送重置邮件" }));
    expect(provider.sendPasswordResetEmail).toHaveBeenCalledWith("planner@example.com");
    expect(screen.getByText("重置邮件已发送，请检查收件箱。")).toBeVisible();
  });

  it("requires an explicit strategy when cloud state is not safely synchronized", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn(async () => undefined);
    render(
      <AccountControl
        provider={createAuthProvider()}
        account={ACCOUNT}
        sync={{ status: "offline", error: null, errorKind: null }}
        onSignOut={onSignOut}
        {...DATA_PROPS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    expect(screen.getByText("离线待同步")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "等待同步后退出" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "放弃未同步修改并退出" }));
    expect(onSignOut).toHaveBeenCalledWith("discard");
  });

  it("waits for the safe sync path when both local and cloud state are settled", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn(async () => undefined);
    render(
      <AccountControl
        provider={createAuthProvider()}
        account={ACCOUNT}
        sync={{ status: "synced", error: null, errorKind: null }}
        onSignOut={onSignOut}
        {...DATA_PROPS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(onSignOut).toHaveBeenCalledWith("sync");
  });

  it("surfaces cloud errors and blocks the wait path for an unresolved conflict", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn(async () => undefined);
    const { rerender } = render(
      <AccountControl
        provider={createAuthProvider()}
        account={ACCOUNT}
        sync={{ status: "error", error: "Cloud unavailable.", errorKind: "unavailable" }}
        onSignOut={onSignOut}
        {...DATA_PROPS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    expect(screen.getByText("Cloud unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(screen.getByRole("button", { name: "等待同步后退出" })).toBeEnabled();

    rerender(
      <AccountControl
        provider={createAuthProvider()}
        account={ACCOUNT}
        sync={{ status: "conflict", error: null, errorKind: null }}
        onSignOut={onSignOut}
        {...DATA_PROPS}
      />,
    );
    expect(screen.getByRole("button", { name: "等待同步后退出" })).toBeDisabled();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("keeps local-only data controls available and requires delete confirmation", async () => {
    const user = userEvent.setup();
    const onDeletePlan = vi.fn(async () => undefined);
    render(
      <AccountControl
        account={null}
        sync={null}
        saveStatus="saved"
        plan={PLAN}
        onImportPlan={vi.fn(async () => undefined)}
        onDeletePlan={onDeletePlan}
      />,
    );

    await user.click(screen.getByRole("button", { name: /本机计划/ }));
    expect(screen.getByText("匿名使用，数据只保存在这台设备")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "删除整份计划" }));
    expect(onDeletePlan).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDeletePlan).toHaveBeenCalledOnce();
  });

  it("keeps safe sign-out available when export validation rejects the current plan", async () => {
    const user = userEvent.setup();
    const plan = createSamplePlan(DEVICE_ID);
    plan.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;

    render(
      <AccountControl
        account={{ id: "account-one", email: "planner@example.com", displayName: null }}
        sync={{ status: "offline", error: null, errorKind: null }}
        saveStatus="local-change"
        plan={plan}
        onImportPlan={vi.fn(async () => undefined)}
        onDeletePlan={vi.fn(async () => undefined)}
        onSignOut={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    await user.click(screen.getByRole("button", { name: "先导出 JSON" }));

    expect(screen.getByText("单个目标的每月金额不能超过 $500,000。")).toBeVisible();
    expect(screen.getByRole("button", { name: "继续编辑" })).toBeEnabled();
  });
});
