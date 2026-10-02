import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PwaStatusView } from "./PwaStatus";

describe("PWA status notice", () => {
  const readyFontLibrary = {
    status: "ready" as const,
    errorMessage: null,
    version: "0123456789abcdef",
    retry: vi.fn(async () => undefined),
  };

  it("allows an update after local persistence without waiting for cloud flush", async () => {
    const update = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const props = {
      notice: "update-ready" as const,
      errorMessage: null,
      install: vi.fn(async () => undefined),
      update,
      dismiss: vi.fn(),
      fontLibrary: readyFontLibrary,
    };
    const { rerender } = render(<PwaStatusView {...props} saveStatus="local-change" />);

    expect(screen.getByRole("button", { name: "等待本机保存" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "关闭应用提示" })).not.toBeInTheDocument();
    rerender(<PwaStatusView {...props} saveStatus="saved" />);
    await user.click(screen.getByRole("button", { name: "立即更新" }));

    expect(update).toHaveBeenCalledOnce();
  });

  it("offers browser installation without hiding the explanation", async () => {
    const install = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <PwaStatusView
        notice="install-ready"
        errorMessage={null}
        saveStatus="saved"
        install={install}
        update={vi.fn(async () => undefined)}
        dismiss={vi.fn()}
        fontLibrary={readyFontLibrary}
      />,
    );

    expect(screen.getByText(/离线时继续规划/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(install).toHaveBeenCalledOnce();
  });

  it("does not claim all fonts are offline before the font cache is complete", () => {
    render(
      <PwaStatusView
        notice="offline-ready"
        errorMessage={null}
        saveStatus="saved"
        install={vi.fn(async () => undefined)}
        update={vi.fn(async () => undefined)}
        dismiss={vi.fn()}
        fontLibrary={{ ...readyFontLibrary, status: "warming" }}
      />,
    );

    expect(screen.getByText("应用外壳已可离线使用")).toBeVisible();
    expect(screen.getByText(/七套主题字体仍在保存中/)).toBeVisible();
    expect(screen.queryByText("完整离线模式已就绪")).not.toBeInTheDocument();
  });

  it("reports complete font readiness only after warmup succeeds", () => {
    render(
      <PwaStatusView
        notice="offline-ready"
        errorMessage={null}
        saveStatus="saved"
        install={vi.fn(async () => undefined)}
        update={vi.fn(async () => undefined)}
        dismiss={vi.fn()}
        fontLibrary={readyFontLibrary}
      />,
    );

    expect(screen.getByText("完整离线模式已就绪")).toBeVisible();
    expect(screen.getByText(/七套主题和字体已经保存在此设备/)).toBeVisible();
  });

  it("offers a font warmup retry without treating the shell as unavailable", async () => {
    const retry = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <PwaStatusView
        notice="font-error"
        errorMessage={null}
        saveStatus="saved"
        install={vi.fn(async () => undefined)}
        update={vi.fn(async () => undefined)}
        dismiss={vi.fn()}
        fontLibrary={{
          status: "error",
          errorMessage: "network unavailable",
          version: "0123456789abcdef",
          retry,
        }}
      />,
    );

    expect(screen.getByText(/应用和当前计划仍可使用/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重试保存字体" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
