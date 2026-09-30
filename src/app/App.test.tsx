import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App foundation", () => {
  it("renders the initialized repository status", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "正式仓库骨架已初始化" })).toBeVisible();
    expect(screen.getByText("React · TypeScript · Vite")).toBeVisible();
  });
});
