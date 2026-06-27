import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");

function copyFixture(from, to) {
  const source = path.join(repoRoot, from);
  const target = path.join(repoRoot, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

copyFixture("tests/fixtures/purpose-atlas/surface.v0.9.jsonl", "packages/purpose-atlas-preview/public/a2ui/purpose-atlas.surface.jsonl");
copyFixture("tests/fixtures/purpose-atlas/atlas-data.json", "packages/purpose-atlas-preview/src/data/atlas-data.json");
console.log("purpose-atlas-fixtures-synced");
