from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"


def load(name: str) -> dict:
    return json.loads((EVIDENCE / name).read_text(encoding="utf-8"))


static = load("static-verification.json")
browser = load("browser-verification.json")
golden = load("golden-witness.json")

if static.get("status") != "pass":
    raise SystemExit("static verification is not pass")
if browser.get("status") != "pass":
    raise SystemExit("browser verification is not pass")
if golden.get("status") != "pass":
    raise SystemExit("golden witness is not pass")

summary = {
    "status": "pass",
    "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
    "package": static["package"],
    "golden": {
        "id": golden["golden"]["id"],
        "source": golden["golden"]["source"],
        "sourceIntegrity": golden["golden"]["integrity"]["pass"],
    },
    "canonicalData": {
        "nodes": static["baseNodes"],
        "edges": static["baseEdges"],
        "events": static["timelineEvents"],
        "sha256": static["canonicalSha256"],
    },
    "a2ui": {
        "protocol": static["protocol"],
        "components": static["components"],
        "actions": static["actions"],
        "unitContractTests": static["testCases"],
        "roleOnlyNodes": static["roleOnlyNodes"],
    },
    "semanticWitness": {
        "stepsExact": golden["semantic"]["stepsCompared"],
        "mismatches": len(golden["semantic"]["mismatches"]),
        "combinedProjectionSha256": golden["semantic"]["combinedProjectionSha256"],
    },
    "visualWitness": {
        name: {
            "pass": case["pass"],
            "ssim": case["metrics"]["ssim"],
            "pixelsWithin15Ratio": case["metrics"]["pixelsWithin15Ratio"],
            "maximumBoxDeltaPx": case["geometry"]["maximumBoxDeltaPx"],
            "textExact": case["geometry"]["textExact"],
        }
        for name, case in golden["visual"].items()
    },
    "browserWitness": {
        name: {
            "pass": result["pass"],
            "checks": result["checks"],
            "consoleErrors": len(result["errors"]),
        }
        for name, result in browser["results"].items()
    },
    "rendererImprovements": static["rendererImprovements"],
}
(EVIDENCE / "verification-summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

manifest_lines = []
for path in sorted(EVIDENCE.iterdir()):
    if not path.is_file() or path.name == "manifest.sha256":
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest_lines.append(f"{digest}  {path.name}")
(EVIDENCE / "manifest.sha256").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")

print(json.dumps({
    "status": summary["status"],
    "semanticStepsExact": summary["semanticWitness"]["stepsExact"],
    "visual": summary["visualWitness"],
    "browser": {name: result["pass"] for name, result in summary["browserWitness"].items()},
}, ensure_ascii=False))
