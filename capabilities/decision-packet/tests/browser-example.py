from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DIST = ROOT / "examples" / "render.decision-packet" / "dist"
BROWSER_PROOF = ROOT / "apps" / "artifact-shell" / "tests" / "decision-packet-browser-proof.py"


def main() -> None:
    assert not DIST.exists(), "decision-packet browser proof must not consume checked-in generated HTML"
    source = BROWSER_PROOF.read_text(encoding="utf-8")
    assert 'render-decision-packet' in source
    assert 'semanticMapSite?.ready === true' in source
    assert 'private.destructive.json' in source
    print(json.dumps({
        "schema": "decision-packet-browser-example-boundary/2",
        "status": "PASS",
        "checkedInDist": False,
        "browserProof": "apps/artifact-shell/tests/decision-packet-browser-proof.py",
    }))


if __name__ == "__main__":
    main()
