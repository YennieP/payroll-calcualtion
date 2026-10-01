import { useEffect, useState } from "react";

import { THEME_OPTIONS } from "../features/planner/themeOptions";
import { usePwaLifecycle } from "../pwa/usePwaLifecycle";
import { loadAllFonts, type FontAuditFailure } from "./fontLoader";
import {
  COMMON_CHINESE_FONT_SAMPLE,
  THEME_TYPOGRAPHY,
  UNCOMMON_CHINESE_FONT_SAMPLE,
} from "./fontManifest";

type AuditStatus = "loading" | "passed" | "failed";

export function FontAuditPage() {
  usePwaLifecycle();
  const [status, setStatus] = useState<AuditStatus>("loading");
  const [failures, setFailures] = useState<readonly FontAuditFailure[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadAllFonts()
      .then((result) => {
        if (cancelled) return;
        setFailures(result.failures);
        setStatus(result.failures.length === 0 ? "passed" : "failed");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="font-audit-page" data-font-audit={status}>
      <header className="font-audit-header">
        <p>PHASE 4 · LOCAL FONT FIXTURE</p>
        <h1>七套主题字体核验</h1>
        <output aria-live="polite">
          {status === "loading" ? "正在加载全部本地字体…" : null}
          {status === "passed" ? "全部字体和测试字形已加载" : null}
          {status === "failed" ? `检测到 ${failures.length || "未知"} 项字体回退` : null}
        </output>
      </header>
      <div className="font-audit-grid">
        {THEME_OPTIONS.map((theme) => (
          <section
            className="planner-app font-audit-card"
            data-theme={theme.id}
            data-audit-theme={theme.id}
            key={theme.id}
          >
            <p className="font-audit-kicker">{theme.kicker}</p>
            <h2>{theme.name}</h2>
            <p className="font-audit-body">
              {COMMON_CHINESE_FONT_SAMPLE} · {UNCOMMON_CHINESE_FONT_SAMPLE}
            </p>
            <p className="font-audit-latin">Required monthly income · $18,420</p>
            <dl>
              <div>
                <dt>Body</dt>
                <dd>{THEME_TYPOGRAPHY[theme.id].body}</dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>{THEME_TYPOGRAPHY[theme.id].display}</dd>
              </div>
              <div>
                <dt>Number</dt>
                <dd>{THEME_TYPOGRAPHY[theme.id].number}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      {failures.length > 0 ? (
        <ul className="font-audit-failures">
          {failures.map((failure) => (
            <li key={`${failure.familyId}-${failure.label}-${failure.sample}`}>
              {failure.family}: {failure.label} ({failure.sample})
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
