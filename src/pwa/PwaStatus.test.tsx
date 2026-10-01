import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PwaStatusView } from "./PwaStatus";

describe("PWA status notice", () => {
  it("waits for local persistence before applying an update", async () => {
    const update = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const props = {
      notice: "update-ready" as const,
      errorMessage: null,
      install: vi.fn(async () => undefined),
      update,
      dismiss: vi.fn(),
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
      />,
    );

    expect(screen.getByText(/离线时继续规划/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(install).toHaveBeenCalledOnce();
  });
});
