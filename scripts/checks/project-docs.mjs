import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredDocuments = [
  "AGENTS.md",
  "docs/project/README.md",
  "docs/project/development-constraints.md",
  "docs/project/agent-constraints.md",
  "docs/project/implementation-plan.md",
  "docs/reference/accepted-demo.html",
];

const missing = requiredDocuments.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  console.error(`Missing required project documents:\n${missing.join("\n")}`);
  process.exit(1);
}

const plan = readFileSync(join(root, "docs/project/implementation-plan.md"), "utf8");
const chineseDate = plan.match(/更新日期：(\d{4}-\d{2}-\d{2})/)?.[1];
const englishDate = plan.match(/Last updated: (\d{4}-\d{2}-\d{2})/)?.[1];

if (!plan.startsWith("# MVP 实施计划") || !plan.includes("# English version")) {
  console.error(
    "The implementation plan must contain a Chinese-first version and an English version.",
  );
  process.exit(1);
}

if (!chineseDate || chineseDate !== englishDate) {
  console.error("The Chinese and English implementation-plan dates must match.");
  process.exit(1);
}

const workflowDirectory = join(root, ".github/workflows");
if (existsSync(workflowDirectory)) {
  const workflows = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/i.test(name));
  if (workflows.length > 0) {
    console.error(
      `Automatic GitHub workflow files are disabled by the project cost constraint:\n${workflows.join("\n")}`,
    );
    process.exit(1);
  }
}

console.log("Project documents and no-remote-CI constraint passed.");
