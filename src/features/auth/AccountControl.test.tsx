import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Account, AuthProvider } from "../../ports/AuthProvider";
import { createSamplePlan } from "../../application/samplePlan";
import { AccountControl } from "./AccountControl";

const ACCOUNT: Account = { id: "user-one", displayName: null, email: "planner@example.com" };
const PLAN = createSamplePlan("30000000-0000-4000-8000-000000000001");

const DATA_PROPS = {
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

  it("shows sync status and delegates privacy-safe sign-out cleanup", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn(async () => undefined);
    render(
      <AccountControl
        provider={createAuthProvider()}
        account={ACCOUNT}
        sync={{ status: "offline", error: null }}
        onSignOut={onSignOut}
        {...DATA_PROPS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    expect(screen.getByText("离线待同步")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("keeps local-only data controls available and requires delete confirmation", async () => {
    const user = userEvent.setup();
    const onDeletePlan = vi.fn(async () => undefined);
    render(
      <AccountControl
        account={null}
        sync={null}
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
});
