import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSW } from "virtual:pwa-register";

import { MemoryPlanRepository } from "../adapters/local/MemoryPlanRepository";
import { createSamplePlan } from "../application/samplePlan";
import type { PlanDocument } from "../domain/plan";
import { updateGoal } from "../domain/plan";
import type { Account, AuthProvider } from "../ports/AuthProvider";
import type { CloudRuntime } from "../ports/CloudRuntime";
import {
  LocalPlanRecoveryError,
  type LocalPlanSyncSnapshot,
} from "../ports/LocalPlanSyncRepository";
import type {
  RemotePlanRepository,
  RemotePlanSnapshot,
  RemotePlanTombstone,
  RemoteSaveResult,
} from "../ports/RemotePlanRepository";
import { RemotePlanReadError } from "../ports/RemotePlanRepository";
import { App } from "./App";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_DEVICE_ID = "30000000-0000-4000-8000-000000000002";
const ACCOUNT: Account = { id: "user-one", displayName: null, email: "planner@example.com" };
const SECOND_ACCOUNT: Account = {
  id: "user-two",
  displayName: null,
  email: "second-planner@example.com",
};

vi.mock("virtual:pwa-register", () => ({ registerSW: vi.fn() }));

type RegisterOptions = NonNullable<Parameters<typeof registerSW>[0]>;

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");
const registerSWMock = vi.mocked(registerSW);
let registerOptions: RegisterOptions | undefined;
let updateServiceWorker: ReturnType<typeof vi.fn<() => Promise<void>>>;

function requireRegisterOptions(): RegisterOptions {
  if (!registerOptions) throw new Error("PWA registration options were not captured.");
  return registerOptions;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  registerOptions = undefined;
  updateServiceWorker = vi.fn(async () => undefined);
  registerSWMock.mockImplementation((options) => {
    registerOptions = options;
    return updateServiceWorker;
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {},
  });
});

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
  if (originalOnline) {
    Object.defineProperty(navigator, "onLine", originalOnline);
  } else {
    Reflect.deleteProperty(navigator, "onLine");
  }
});

class FakeAuthProvider implements AuthProvider {
  private readonly listeners = new Set<(account: Account | null) => void>();
  private emitInitialState: boolean;
  private signOutError: Error | null = null;
  signOutCount = 0;
  signOutBarrier: Promise<void> | null = null;

  constructor(
    private account: Account | null,
    emitInitialState = true,
  ) {
    this.emitInitialState = emitInitialState;
  }

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
    this.signOutCount += 1;
    if (this.signOutBarrier) await this.signOutBarrier;
    if (this.signOutError) throw this.signOutError;
    this.setAccount(null);
  }

  onAuthChange(listener: (account: Account | null) => void): () => void {
    this.listeners.add(listener);
    if (this.emitInitialState) listener(this.account);
    return () => this.listeners.delete(listener);
  }

  resolveInitialState(account: Account | null = this.account) {
    this.emitInitialState = true;
    this.setAccount(account);
  }

  rejectNextSignOut(error: Error) {
    this.signOutError = error;
  }

  switchAccount(account: Account | null) {
    this.setAccount(account);
  }

  private setAccount(account: Account | null) {
    this.account = account;
    this.listeners.forEach((listener) => listener(account));
  }
}

class FakeRemotePlanRepository implements RemotePlanRepository {
  private readonly snapshots = new Map<string, RemotePlanSnapshot>();
  private readonly listeners = new Map<string, Set<(snapshot: RemotePlanSnapshot) => void>>();
  pushCount = 0;
  pushBarrier: Promise<void> | null = null;
  pushError: Error | null = null;
  private readonly loadErrors = new Map<string, Error[]>();

  async load(accountId: string): Promise<RemotePlanSnapshot | null> {
    const errors = this.loadErrors.get(accountId);
    const error = errors?.shift();
    if (error) throw error;
    return this.snapshots.get(accountId) ?? null;
  }

  failNextLoad(accountId: string, error: Error) {
    const errors = this.loadErrors.get(accountId) ?? [];
    errors.push(error);
    this.loadErrors.set(accountId, errors);
  }

  async push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult> {
    this.pushCount += 1;
    if (this.pushError) throw this.pushError;
    if (this.pushBarrier) await this.pushBarrier;
    const remote = this.snapshots.get(accountId);
    const remoteRevision =
      remote?.kind === "plan" ? remote.plan.revision : (remote?.tombstone.revision ?? 0);
    if (remoteRevision !== expectedRemoteRevision) {
      if (!remote) throw new Error("Missing conflict plan.");
      return { status: "conflict", remote };
    }
    this.seed(accountId, plan);
    return { status: "saved", revision: plan.revision };
  }

  subscribe(accountId: string, onRemoteChange: (snapshot: RemotePlanSnapshot) => void): () => void {
    const listeners = this.listeners.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.listeners.set(accountId, listeners);
    return () => listeners.delete(onRemoteChange);
  }

  async delete(accountId: string, tombstone: RemotePlanTombstone) {
    const current = this.snapshots.get(accountId);
    const currentRevision =
      current?.kind === "plan" ? current.plan.revision : (current?.tombstone.revision ?? 0);
    const saved = { ...tombstone, revision: Math.max(tombstone.revision, currentRevision + 1) };
    const snapshot = { kind: "deleted", tombstone: saved } as const;
    this.snapshots.set(accountId, snapshot);
    this.listeners.get(accountId)?.forEach((listener) => listener(snapshot));
    return { revision: saved.revision };
  }

  seed(accountId: string, plan: PlanDocument) {
    const snapshot = { kind: "plan", plan } as const;
    this.snapshots.set(accountId, snapshot);
    this.listeners.get(accountId)?.forEach((listener) => listener(snapshot));
  }
}

class FailOnceDeleteRepository extends MemoryPlanRepository {
  private shouldFail = true;

  override async delete(accountId: string): Promise<void> {
    if (accountId === ACCOUNT.id && this.shouldFail) {
      this.shouldFail = false;
      throw new Error("Injected cache cleanup failure.");
    }
    await super.delete(accountId);
  }
}

class RecoverableLegacyRepository extends MemoryPlanRepository {
  private recoveryPending = true;
  readonly recoveryJson = JSON.stringify({
    schemaVersion: 1,
    planId: "10000000-0000-4000-8000-000000000001",
    legacyPadding: "preserved-before-clear",
  });

  constructor(private readonly recoveryAccountId = "anonymous-local") {
    super();
  }

  private recoverOrContinue(accountId: string) {
    if (this.recoveryPending && accountId === this.recoveryAccountId) {
      throw new LocalPlanRecoveryError(this.recoveryJson);
    }
  }

  override async load(accountId: string): Promise<PlanDocument | null> {
    this.recoverOrContinue(accountId);
    return super.load(accountId);
  }

  override async loadPlanSync(accountId: string): Promise<LocalPlanSyncSnapshot> {
    this.recoverOrContinue(accountId);
    return super.loadPlanSync(accountId);
  }

  override async delete(accountId: string): Promise<void> {
    if (accountId === this.recoveryAccountId) this.recoveryPending = false;
    await super.delete(accountId);
  }
}

function createCloudRuntime(account: Account | null = ACCOUNT, emitInitialState = true) {
  const auth = new FakeAuthProvider(account, emitInitialState);
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
  it("offers a non-destructive export before clearing an incompatible local plan", async () => {
    const repository = new RecoverableLegacyRepository();
    const user = userEvent.setup();
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:worthwhile-recovery");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<App repository={repository} deviceId={DEVICE_ID} />);

    expect(await screen.findByRole("heading", { name: "本机计划需要恢复" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "已置顶" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出原始计划 JSON" }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:worthwhile-recovery");

    await user.click(screen.getByRole("button", { name: "清除此设备副本并继续" }));
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
    await expect(repository.load("anonymous-local")).resolves.toMatchObject({ revision: 0 });
  });

  it("does not treat an offline account without a cache as an empty cloud plan", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const repository = new MemoryPlanRepository();
    const { runtime } = createCloudRuntime();
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "云端暂时无法读取" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "已置顶" })).not.toBeInTheDocument();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await user.click(screen.getByRole("button", { name: "重新读取云端计划" }));
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
  });

  it("clears the incompatible anonymous record without deleting a valid signed-in cache", async () => {
    const repository = new RecoverableLegacyRepository("anonymous-local");
    const accountPlan = { ...createSamplePlan(OTHER_DEVICE_ID), revision: 2 };
    await repository.replacePlanAndSyncState(ACCOUNT.id, accountPlan, {
      accountId: ACCOUNT.id,
      remoteRevision: 2,
      pendingRevision: null,
      pendingDelete: false,
    });
    const { runtime, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, accountPlan);
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "本机计划需要恢复" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "清除此设备副本并重新读取" }));
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
    await expect(repository.load(ACCOUNT.id)).resolves.toEqual(accountPlan);
    await expect(repository.load("anonymous-local")).resolves.toBeNull();
  });

  it("finishes its immediate local save when development StrictMode replays effects", async () => {
    const repository = new MemoryPlanRepository();

    render(
      <StrictMode>
        <App repository={repository} deviceId={DEVICE_ID} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    await expect(repository.load("anonymous-local")).resolves.toMatchObject({ revision: 1 });
  });

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

  it("rejects an excessive amount without crashing or replacing the last valid value", async () => {
    const { user } = await renderPlanner();
    const amount = screen.getByRole("spinbutton", { name: "房租每月金额" });
    const previousAmount = Number((amount as HTMLInputElement).value);

    await user.clear(amount);
    await user.type(amount, "500001");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "单个目标的每月金额不能超过 $500,000。",
    );
    expect(screen.getByRole("spinbutton", { name: "房租每月金额" })).toHaveValue(previousAmount);
    expect(screen.getByRole("heading", { name: "已置顶" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByText("这次修改没有保存")).not.toBeInTheDocument();
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

    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { planId: anonymousPlan.planId },
    });
    await expect(repository.load("anonymous-local")).resolves.toBeNull();
  });

  it("keeps the planner behind an authentication gate until the first auth state resolves", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime(ACCOUNT, false);
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(screen.getByRole("heading", { name: "正在恢复账户" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "已置顶" })).not.toBeInTheDocument();
    expect(await repository.load("anonymous-local")).toBeNull();

    act(() => auth.resolveInitialState());
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
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

  it("blocks an empty device on a temporary cloud-load failure and can retry", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    plans.failNextLoad(
      ACCOUNT.id,
      new RemotePlanReadError("unavailable", "云端计划暂时无法读取，请检查网络后重试。"),
    );
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "云端暂时无法读取" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "已置顶" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新读取云端计划" }));
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
  });

  it("exports an incompatible cloud plan without deleting it before retry", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    const recoveryJson = JSON.stringify({ schemaVersion: 1, legacyPadding: "cloud-preserved" });
    plans.failNextLoad(
      ACCOUNT.id,
      new RemotePlanReadError("corrupt", "云端计划的数据结构不兼容或已损坏。", {
        recoveryJson,
      }),
    );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:worthwhile-cloud-recovery");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "云端计划需要处理" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "导出云端原始计划 JSON" }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:worthwhile-cloud-recovery");
    await user.click(screen.getByRole("button", { name: "重新读取云端计划" }));
    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
  });

  it("keeps a valid account cache usable while reporting corrupt cloud data", async () => {
    const repository = new MemoryPlanRepository();
    const localPlan = { ...createSamplePlan(DEVICE_ID), revision: 2 };
    await repository.replace(ACCOUNT.id, localPlan);
    const { runtime, plans } = createCloudRuntime();
    plans.failNextLoad(
      ACCOUNT.id,
      new RemotePlanReadError("corrupt", "云端计划的数据结构不兼容或已损坏，已停止自动载入。"),
    );
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);

    expect(await screen.findByRole("heading", { name: "已置顶" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    expect(screen.getByText("同步失败")).toBeVisible();
    expect(screen.getByText("云端计划的数据结构不兼容或已损坏，已停止自动载入。")).toBeVisible();
    await expect(repository.load(ACCOUNT.id)).resolves.toEqual(localPlan);
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

  it("debounces rapid plan changes into one remote transaction", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    await screen.findByRole("heading", { name: "已置顶" });
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /CA · Single/ }));
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "600" } });
    fireEvent.change(slider, { target: { value: "700" } });
    fireEvent.change(slider, { target: { value: "800" } });

    await waitFor(() => expect(plans.pushCount).toBe(1));
    expect(slider).toHaveValue("800");
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
    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 1 },
    });
  });

  it("flushes a pending local edit before signing out and clearing the account cache", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    const blockedPush = deferred();
    plans.pushBarrier = blockedPush.promise;
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    await waitFor(() =>
      expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 }),
    );
    fireEvent.change(amount, { target: { value: "4321" } });
    fireEvent.blur(amount);
    await waitFor(async () => {
      const snapshot = await repository.loadPlanSync(ACCOUNT.id);
      expect(snapshot.syncState?.pendingRevision).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    await user.click(screen.getByRole("button", { name: "等待同步后退出" }));
    expect(auth.currentAccount()).toEqual(ACCOUNT);
    await expect(repository.load(ACCOUNT.id)).resolves.not.toBeNull();

    blockedPush.resolve();
    expect(await screen.findByRole("button", { name: /跨设备同步/ })).toBeVisible();
    const remote = await plans.load(ACCOUNT.id);
    expect(remote).toMatchObject({ kind: "plan", plan: { revision: 2 } });
    expect(
      remote?.kind === "plan" ? remote.plan.categories[0].goals[0].monthlyAmountCents : null,
    ).toBe(432_100);
    await expect(repository.load(ACCOUNT.id)).resolves.toBeNull();
  });

  it("keeps recoverable account data when authentication sign-out fails", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    auth.rejectNextSignOut(new Error("Injected auth failure."));
    const blockedSignOut = deferred();
    auth.signOutBarrier = blockedSignOut.promise;
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    await screen.findByRole("heading", { name: "已置顶" });
    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(screen.getByRole("button", { name: "退出并清除此设备缓存" })).toBeDisabled();
    await expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 });
    blockedSignOut.resolve();

    expect(await screen.findByText("账户操作失败，请稍后重试。")).toBeVisible();
    expect(auth.currentAccount()).toEqual(ACCOUNT);
    await expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 });
  });

  it("blocks safe sign-out after a local-save failure but permits explicit discard", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    vi.spyOn(repository, "savePlanAndSyncState").mockRejectedValueOnce(
      new Error("Injected local save failure."),
    );
    fireEvent.change(amount, { target: { value: "4888" } });
    fireEvent.blur(amount);
    await waitFor(() => expect(screen.getByTitle("Injected local save failure.")).toBeVisible());

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    await user.click(screen.getByRole("button", { name: "等待同步后退出" }));
    expect(await screen.findByText("本机修改尚未安全保存，暂时不能退出。")).toBeVisible();
    expect(auth.currentAccount()).toEqual(ACCOUNT);
    await expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 });

    await user.click(screen.getByRole("button", { name: "放弃未同步修改并退出" }));
    expect(await screen.findByRole("button", { name: /跨设备同步/ })).toBeVisible();
    expect(auth.currentAccount()).toBeNull();
    await expect(repository.load(ACCOUNT.id)).resolves.toBeNull();
  });

  it("allows explicit discard while offline without changing the cloud copy", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    const remotePlan = { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 };
    plans.seed(ACCOUNT.id, remotePlan);
    await repository.replacePlanAndSyncState(ACCOUNT.id, remotePlan, {
      accountId: ACCOUNT.id,
      remoteRevision: 1,
      pendingRevision: null,
      pendingDelete: false,
    });
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    fireEvent.change(amount, { target: { value: "4999" } });
    fireEvent.blur(amount);
    await waitFor(async () => {
      const snapshot = await repository.loadPlanSync(ACCOUNT.id);
      expect(snapshot.syncState?.pendingRevision).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(screen.getByRole("button", { name: "等待同步后退出" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "放弃未同步修改并退出" }));

    expect(await screen.findByRole("button", { name: /跨设备同步/ })).toBeVisible();
    expect(auth.currentAccount()).toBeNull();
    await expect(repository.load(ACCOUNT.id)).resolves.toBeNull();
    await expect(plans.load(ACCOUNT.id)).resolves.toEqual({ kind: "plan", plan: remotePlan });
  });

  it("keeps pending data and the authenticated session when cloud flush fails", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    plans.pushError = new Error("Injected cloud write failure.");
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    fireEvent.change(amount, { target: { value: "4777" } });
    fireEvent.blur(amount);
    await waitFor(() => expect(plans.pushCount).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    expect(screen.getByText("同步失败")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    await user.click(screen.getByRole("button", { name: "等待同步后退出" }));

    expect(
      await screen.findByText("云端同步尚未完成，请重试、先导出计划，或明确放弃修改。"),
    ).toBeVisible();
    expect(auth.currentAccount()).toEqual(ACCOUNT);
    await expect(repository.loadPlanSync(ACCOUNT.id)).resolves.toMatchObject({
      plan: { revision: 2 },
      syncState: { pendingRevision: 2 },
    });
  });

  it("blocks on failed cache cleanup after auth sign-out and supports a safe retry", async () => {
    const repository = new FailOnceDeleteRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    const user = userEvent.setup();

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    await screen.findByRole("heading", { name: "已置顶" });
    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));

    expect(await screen.findByRole("heading", { name: "设备缓存尚未清理" })).toBeVisible();
    expect(auth.currentAccount()).toBeNull();
    await expect(repository.load(ACCOUNT.id)).resolves.toMatchObject({ revision: 1 });

    await user.click(screen.getByRole("button", { name: "重试清理设备缓存" }));
    expect(await screen.findByRole("button", { name: /跨设备同步/ })).toBeVisible();
    await expect(repository.load(ACCOUNT.id)).resolves.toBeNull();
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
    await waitFor(() =>
      expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
        kind: "plan",
        plan: { revision: 2 },
      }),
    );
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
    await user.click(screen.getByRole("button", { name: /planner@example.com/ }));
    await user.click(screen.getByRole("button", { name: "退出并清除此设备缓存" }));
    expect(screen.getByRole("button", { name: "等待同步后退出" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    await user.click(screen.getByRole("button", { name: "保留当前修改" }));
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    await waitFor(() =>
      expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
        kind: "plan",
        plan: { revision: 4, updatedByDevice: DEVICE_ID },
      }),
    );
  });

  it("keeps a locally committed edit when a PWA update unmounts inside the cloud debounce", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    const { unmount } = render(
      <App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />,
    );
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    fireEvent.change(amount, { target: { value: "4321" } });
    fireEvent.blur(amount);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const localBeforeUpdate = await repository.loadPlanSync(ACCOUNT.id);
    expect(localBeforeUpdate.plan?.revision).toBe(2);
    expect(localBeforeUpdate.plan?.categories[0].goals[0].monthlyAmountCents).toBe(432_100);
    expect(localBeforeUpdate.syncState).toMatchObject({ remoteRevision: 1, pendingRevision: 2 });
    expect(plans.pushCount).toBe(0);

    act(() => requireRegisterOptions().onNeedRefresh?.());
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 1 },
    });
    const persisted = await repository.loadPlanSync(ACCOUNT.id);
    expect(persisted.plan?.revision).toBe(2);
    expect(persisted.plan?.categories[0].goals[0].monthlyAmountCents).toBe(432_100);
    expect(persisted.syncState).toMatchObject({ remoteRevision: 1, pendingRevision: 2 });
  });

  it("keeps a pending edit scoped to its account when the authenticated session switches", async () => {
    const repository = new MemoryPlanRepository();
    const { runtime, auth, plans } = createCloudRuntime();
    plans.seed(ACCOUNT.id, { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 });
    const secondPlan = { ...createSamplePlan(OTHER_DEVICE_ID), revision: 1 };
    secondPlan.categories[0].goals[0].monthlyAmountCents = 555_500;
    plans.seed(SECOND_ACCOUNT.id, secondPlan);

    render(<App repository={repository} deviceId={DEVICE_ID} cloudRuntime={runtime} />);
    const amount = await screen.findByRole("spinbutton", { name: "房租每月金额" });
    await waitFor(() => expect(screen.getByText("已保存到本机")).toBeVisible());
    fireEvent.change(amount, { target: { value: "4444" } });
    fireEvent.blur(amount);
    await waitFor(async () => {
      const snapshot = await repository.loadPlanSync(ACCOUNT.id);
      expect(snapshot.plan?.revision).toBe(2);
      expect(snapshot.plan?.categories[0].goals[0].monthlyAmountCents).toBe(444_400);
      expect(snapshot.syncState).toMatchObject({ remoteRevision: 1, pendingRevision: 2 });
    });
    expect(plans.pushCount).toBe(0);

    act(() => auth.switchAccount(SECOND_ACCOUNT));
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: "房租每月金额" })).toHaveValue(5555),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const firstAccount = await repository.loadPlanSync(ACCOUNT.id);
    expect(firstAccount.plan?.revision).toBe(2);
    expect(firstAccount.plan?.categories[0].goals[0].monthlyAmountCents).toBe(444_400);
    expect(firstAccount.syncState).toMatchObject({ remoteRevision: 1, pendingRevision: 2 });
    await expect(plans.load(ACCOUNT.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 1 },
    });
  });
});
