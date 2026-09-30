import type { PropsWithChildren } from "react";

import type { ThemeId } from "../../domain/plan/types";

interface AppShellProps extends PropsWithChildren {
  themeId: ThemeId;
}

export function AppShell({ children, themeId }: AppShellProps) {
  return (
    <div className="app-shell" data-theme={themeId}>
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true">
          W
        </span>
        <span>WORTHWHILE</span>
      </header>
      <main className="foundation-panel">{children}</main>
    </div>
  );
}
