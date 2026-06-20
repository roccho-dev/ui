from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"VERIFY FAILED: {message}")


def canonical_digest(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
data = json.loads((ROOT / "src/data/atlas-data.json").read_text(encoding="utf-8"))
golden_lock = json.loads((ROOT / "golden/GOLDEN_LOCK.json").read_text(encoding="utf-8"))

require(package["name"] == "purpose-atlas-v6-a2ui-source-ui-refactor", "package identity mismatch")
require(package["version"] == "6.2.0", "package version mismatch")
require(package["dependencies"].get("@a2ui/web_core") == "0.10.1", "web_core must be pinned")
require(package["dependencies"].get("@a2ui/lit") == "0.10.1", "lit renderer must be pinned")
require(package["devDependencies"].get("vite") == "8.0.16", "Vite must be pinned")
require(package["devDependencies"].get("esbuild") == "0.28.1", "esbuild must be pinned")

require((ROOT / "dist/index.html").exists(), "production build missing")
require((ROOT / "dist/a2ui/purpose-atlas.surface.jsonl").exists(), "A2UI JSONL missing from dist")
require((ROOT / "dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html").exists(), "standalone preview missing")
require((ROOT / "golden/source/ui-shell.html").exists(), "uncompressed latest source UI golden missing")

canonical = {
    "nodes": canonical_digest(data["base_nodes"]),
    "edges": canonical_digest(data["base_edges"]),
    "events": canonical_digest(data["events"]),
}
require(len(data["base_nodes"]) == 26, "26 base nodes must be preserved")
require(len(data["base_edges"]) == 27, "27 base edges must be preserved")
require(len(data["events"]) == 40, "40-event timeline must be preserved")
require(canonical == golden_lock["dataCanonicalSha256"], "canonical graph/event hashes differ from golden")
role_only = [node["id"] for node in data["base_nodes"] if node.get("kind") in {"role", "member", "actor"}]
require(not role_only, f"role-only nodes remain: {role_only}")

source_paths = sorted((ROOT / "src").rglob("*.js"))
sources = "\n".join(path.read_text(encoding="utf-8") for path in source_paths)
for banned in ["document.getElementById", ".innerHTML", "eval(", "new Function("]:
    require(banned not in sources, f"banned imperative pattern remains: {banned}")

component_files = sorted((ROOT / "src/components").glob("*.js"))
require([path.name for path in component_files] == ["atlas-source-surface.js"], "stale A2UI UI components remain")
component_source = component_files[0].read_text(encoding="utf-8")
for source_ui_token in [
    "Purpose Decision Atlas · v6 UI refactor",
    "Timeline replay",
    "外周 = 再帰責務",
    "目的の支援経路と、同じnode群から再帰集約した責務",
]:
    require(source_ui_token in component_source, f"latest source UI token missing: {source_ui_token}")

renderer = (ROOT / "src/ui/cached-atlas-renderer.js").read_text(encoding="utf-8")
renderer_requirements = {
    "offscreenWorldCache": "this.worldSurface = document.createElement('canvas')",
    "twoCanvasLayers": "sceneCanvas" in renderer and "overlayCanvas" in renderer,
    "pointerRafCoalescing": "this.pointerRaf" in renderer and "requestAnimationFrame(() => this.processHover())" in renderer,
    "hoverOverlayOnly": "this.scheduleRender(false, true)" in renderer,
    "desktopDprCap2MobileCap1_5": "Math.min(mobile ? 1.5 : 2" in renderer,
    "sceneBuildCounter": "sceneBuilds" in renderer,
}
for name, condition in list(renderer_requirements.items()):
    if isinstance(condition, str):
        renderer_requirements[name] = condition in renderer
require(all(renderer_requirements.values()), f"renderer improvement missing: {renderer_requirements}")

surface_lines = [line for line in (ROOT / "public/a2ui/purpose-atlas.surface.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
require(len(surface_lines) == 3, "surface JSONL should have create/components/data messages")
records = [json.loads(line) for line in surface_lines]
require(records[0]["version"] == "v0.9", "protocol must be v0.9")
require(records[0]["createSurface"]["sendDataModel"] is True, "client data model sync must be enabled")
require(records[0]["createSurface"]["catalogId"].endswith("/purpose-atlas/v6-source-ui"), "source UI catalog mismatch")
components = records[1]["updateComponents"]["components"]
require(len(components) == 1 and components[0]["id"] == "root" and components[0]["component"] == "AtlasSourceSurface", "A2UI root declaration mismatch")
actions = {
    value["event"]["name"]
    for value in components[0].values()
    if isinstance(value, dict) and isinstance(value.get("event"), dict) and value["event"].get("name")
}
require(len(actions) == 15, "all 15 Atlas actions must be declared")

test_cases = sum(len(re.findall(r"\btest\(", path.read_text(encoding="utf-8"))) for path in (ROOT / "test").glob("*.test.mjs"))
require(test_cases == 14, "expected 14 verification test cases")

report = {
    "status": "pass",
    "package": {"name": package["name"], "version": package["version"]},
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
    "canonicalSha256": canonical,
    "roleOnlyNodes": len(role_only),
    "testCases": test_cases,
    "rendererImprovements": renderer_requirements,
    "imperativePatternCounts": {
        "getElementById": 0,
        "innerHTML": 0,
        "eval": 0,
        "newFunction": 0,
    },
    "goldenSource": golden_lock["uiSource"],
    "standaloneBytes": (ROOT / "dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html").stat().st_size,
    "distBytes": sum(path.stat().st_size for path in (ROOT / "dist").rglob("*") if path.is_file()),
}
(ROOT / "evidence").mkdir(parents=True, exist_ok=True)
(ROOT / "evidence/static-verification.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(report, ensure_ascii=False))
