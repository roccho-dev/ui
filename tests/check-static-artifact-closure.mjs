import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
if (!root || !fs.statSync(root).isDirectory()) {
  throw new Error("artifact root directory is required");
}

const files = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && /\.(?:mjs|js)$/u.test(entry.name)) files.push(target);
  }
};
walk(root);

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

const failures = [];
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
    if (!fs.existsSync(target)) {
      failures.push({
        file: path.relative(root, file),
        spec,
        target: path.relative(root, target),
        reason: "missing-static-dependency",
      });
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ schema: "ui-static-artifact-closure/1", status: "PASS", files: files.length }));
