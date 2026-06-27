import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const fixtureRoot = process.env.PURPOSE_ATLAS_FIXTURE_ROOT || path.join(repoRoot, "tests/fixtures/purpose-atlas");

function copyFixture(fileName, to) {
  const source = path.join(fixtureRoot, fileName);
  const target = path.join(packageRoot, to);
  if (!fs.existsSync(source) && fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

copyFixture("surface.v0.9.jsonl", "public/a2ui/purpose-atlas.surface.jsonl");
copyFixture("atlas-data.json", "src/data/atlas-data.json");
console.log("purpose-atlas-fixtures-synced");
