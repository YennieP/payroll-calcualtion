import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSW } from "virtual:pwa-register";

import { PwaStatus } from "./PwaStatus";

vi.mock("virtual:pwa-register", () => ({ registerSW: vi.fn() }));

type RegisterOptions = NonNullable<Parameters<typeof registerSW>[0]>;

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const registerSWMock = vi.mocked(registerSW);

let registerOptions: RegisterOptions | undefined;
let updateServiceWorker: ReturnType<typeof vi.fn<() => Promise<void>>>;

function requireRegisterOptions(): RegisterOptions {
  if (!registerOptions) throw new Error("PWA registration options were not captured.");
  return registerOptions;
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
});

describe("PWA lifecycle", () => {
  it("captures the browser install prompt and completes an accepted installation", async () => {
    const user = userEvent.setup();
    const prompt = vi.fn(async () => undefined);
    const installEvent = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(installEvent, {
      prompt: { value: prompt },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });

    render(<PwaStatus saveStatus="saved" />);
    act(() => globalThis.dispatchEvent(installEvent));

    expect(installEvent.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText("安装 Worthwhile")).not.toBeInTheDocument());
  });

  it("turns the service-worker refresh callback into a user-controlled update", async () => {
    const user = userEvent.setup();
    render(<PwaStatus saveStatus="saved" />);

    act(() => requireRegisterOptions().onNeedRefresh?.());
    expect(screen.getByText("新版本已经准备好")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "立即更新" }));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(screen.getByText("正在更新")).toBeVisible();
  });
});
