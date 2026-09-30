import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const violations = [];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

for (const file of sourceFiles(sourceRoot)) {
  const projectPath = relative(root, file);
  const contents = readFileSync(file, "utf8");
  const imports = [...contents.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );

  if (projectPath.startsWith("src/domain/")) {
    const forbiddenImport = imports.find(
      (specifier) =>
        specifier === "react" ||
        specifier.startsWith("react/") ||
        specifier === "firebase" ||
        specifier.startsWith("firebase/") ||
        specifier === "idb" ||
        specifier.startsWith("idb/"),
    );
    if (forbiddenImport) {
      violations.push(`${projectPath}: domain imports forbidden module ${forbiddenImport}`);
    }

    const browserGlobalAccess =
      /\b(window|document|localStorage|indexedDB|navigator)\s*(?:\.|\[|\()/.test(contents) ||
      /\btypeof\s+(window|document|localStorage|indexedDB|navigator)\b/.test(contents);
    if (browserGlobalAccess) {
      violations.push(`${projectPath}: domain references a browser global`);
    }
  }

  if (!projectPath.startsWith("src/adapters/firebase/")) {
    const firebaseImport = imports.find(
      (specifier) => specifier === "firebase" || specifier.startsWith("firebase/"),
    );
    if (firebaseImport) {
      violations.push(`${projectPath}: Firebase import is outside the Firebase adapter`);
    }
  }
}

for (const required of ["src/ports/PlanRepository.ts", "src/ports/AuthProvider.ts"]) {
  if (!statSync(join(root, required), { throwIfNoEntry: false })?.isFile()) {
    violations.push(`${required}: required portability boundary is missing`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Architecture boundaries passed.");
