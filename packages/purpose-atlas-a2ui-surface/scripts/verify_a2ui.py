from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"VERIFY FAILED: {message}")


package = json.loads((ROOT / "package.json").read_text())
data = json.loads((ROOT / "src/data/atlas-data.json").read_text())
require(package["dependencies"].get("@a2ui/web_core") == "0.10.1", "web_core must be pinned")
require(package["dependencies"].get("@a2ui/lit") == "0.10.1", "lit renderer must be pinned")
require(package["devDependencies"].get("vite") == "8.0.16", "Vite must be pinned to the audited release")
require(package["devDependencies"].get("esbuild") == "0.28.1", "esbuild must be pinned to the audited release")
require((ROOT / "dist/index.html").exists(), "production build missing")
require((ROOT / "dist/a2ui/purpose-atlas.surface.jsonl").exists(), "A2UI JSONL missing from dist")
require(len(data["events"]) == 40, "40-event timeline must be preserved")
role_only = [node["id"] for node in data["base_nodes"] if node.get("kind") in {"role", "member", "actor"}]
require(not role_only, f"role-only nodes remain: {role_only}")

source_paths = [path for path in (ROOT / "src").rglob("*.js")]
sources = "\n".join(path.read_text() for path in source_paths)
for banned in ["document.getElementById", ".innerHTML", "eval(", "new Function("]:
    require(banned not in sources, f"banned imperative pattern remains: {banned}")

surface_lines = [line for line in (ROOT / "public/a2ui/purpose-atlas.surface.jsonl").read_text().splitlines() if line.strip()]
require(len(surface_lines) == 3, "surface JSONL should have create/components/data messages")
records = [json.loads(line) for line in surface_lines]
require(records[0]["version"] == "v0.9", "protocol must be v0.9")
require(records[0]["createSurface"]["sendDataModel"] is True, "client data model sync must be enabled")
components = records[1]["updateComponents"]["components"]
actions = {
    value["event"]["name"]
    for component in components
    for value in component.values()
    if isinstance(value, dict) and isinstance(value.get("event"), dict) and value["event"].get("name")
}
require(len(actions) == 15, "all 15 Atlas actions must be declared")
test_cases = sum(len(re.findall(r"\btest\(", path.read_text())) for path in (ROOT / "test").glob("*.test.mjs"))
require(test_cases == 14, "expected 14 verification test cases")

report = {
    "status": "pass",
    "protocol": "v0.9",
    "webCore": package["dependencies"]["@a2ui/web_core"],
    "lit": package["dependencies"]["@a2ui/lit"],
    "vite": package["devDependencies"]["vite"],
    "esbuild": package["devDependencies"]["esbuild"],
    "messages": len(records),
    "components": len(components),
    "actions": len(actions),
    "baseNodes": len(data["base_nodes"]),
    "baseEdges": len(data["base_edges"]),
    "timelineEvents": len(data["events"]),
    "roleOnlyNodes": len(role_only),
    "testCases": test_cases,
    "directGetElementById": 0,
    "innerHTML": 0,
    "eval": 0,
    "newFunction": 0,
    "distBytes": sum(path.stat().st_size for path in (ROOT / "dist").rglob("*") if path.is_file()),
}
evidence_dir = ROOT / "evidence"
evidence_dir.mkdir(exist_ok=True)
(evidence_dir / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False))
