import fs from "node:fs";
import path from "node:path";

const reportFailure = failures => {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
};
const args = process.argv.slice(2);
if (args.length !== 1 || !args[0].trim()) {
  reportFailure([{ reason: "artifact-root-required" }]);
}
let root;
try {
  root = fs.realpathSync(path.resolve(args[0]));
  if (!fs.statSync(root).isDirectory()) throw new Error("not-directory");
} catch {
  reportFailure([{ reason: "invalid-artifact-root" }]);
}
const inside = target => {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
};
const files = [];
const failures = [];
const ancestors = new Set();
const walk = directory => {
  const actual = fs.realpathSync(directory);
  if (ancestors.has(actual)) return;
  ancestors.add(actual);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    let resolved;
    try { resolved = fs.realpathSync(target); }
    catch { failures.push({ file: path.relative(root, target), reason: "unresolved-artifact-entry" }); continue; }
    if (!inside(resolved)) {
      failures.push({ file: path.relative(root, target), reason: "artifact-entry-escape" });
      continue;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) walk(target);
    else if (stat.isFile() && /\.(?:mjs|js)$/u.test(entry.name)) files.push(target);
  }
  ancestors.delete(actual);
};
walk(root);
if (files.length === 0) failures.push({ reason: "empty-module-scope" });

const staticModuleSpecifiers = source => {
  const specs = new Set();
  const lines = source.split("\n");

  let statement = "";
  const flush = () => {
    if (!statement) return;
    const from = statement.match(/\bfrom\s*["']([^"']+)["']/u);
    const sideEffect = statement.match(/^\s*import\s*["']([^"']+)["']/u);
    if (from) specs.add(from[1]);
    if (sideEffect) specs.add(sideEffect[1]);
    statement = "";
  };

  for (const line of lines) {
    if (!statement && /^\s*(?:import|export)\b/u.test(line)) statement = line;
    else if (statement) statement += "\n" + line;
    if (statement && /;\s*(?:\/\/.*)?$/u.test(line)) flush();
  }
  flush();

  for (const pattern of [
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gu,
  ]) {
    let match;
    while ((match = pattern.exec(source))) specs.add(match[1]);
  }
  return specs;
};

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const spec of staticModuleSpecifiers(source)) {
    if (/^(?:https?:|data:|blob:)/u.test(spec)) continue;
    if (!spec.startsWith(".") && !spec.startsWith("/")) {
      failures.push({ file: path.relative(root, file), spec, reason: "bare-import" });
      continue;
    }

    const clean = spec.split(/[?#]/u, 1)[0];
    const target = spec.startsWith("/")
      ? path.join(root, clean.slice(1))
      : path.resolve(path.dirname(file), clean);
    const item = { file: path.relative(root, file), spec, target: path.relative(root, target) };
    if (!inside(target)) {
      failures.push({ ...item, reason: "static-dependency-escape" });
      continue;
    }
    try {
      if (!inside(fs.realpathSync(target))) {
        failures.push({ ...item, reason: "static-dependency-escape" });
      } else if (!fs.statSync(target).isFile()) {
        failures.push({ ...item, reason: "static-dependency-not-file" });
      }
    } catch {
      failures.push({ ...item, reason: "missing-static-dependency" });
    }
  }
}

if (failures.length) reportFailure(failures);
console.log(JSON.stringify({ schema: "ui-static-artifact-closure/1", status: "PASS", files: files.length }));
