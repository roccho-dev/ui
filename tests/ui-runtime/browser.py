from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

parser = argparse.ArgumentParser()
parser.add_argument("--phase", required=True)
parser.add_argument("--entry", required=True)
parser.add_argument("--transport", required=True)
args = parser.parse_args()
assert (args.phase, args.entry, args.transport) == ("p2", "artifact-shell", "iframe")

run = subprocess.run(
    ["python3", "apps/artifact-shell/tests/browser-proof.py"],
    cwd=ROOT,
    capture_output=True,
    text=True,
    check=False,
)
if run.returncode != 0:
    raise SystemExit(run.stderr or run.stdout)
receipt = json.loads(run.stdout.strip().splitlines()[-1])
assert receipt["schema"] == "artifact-shell-semantic-map-browser-proof/2"
assert receipt["status"] == "PASS"
assert receipt["patterns"] == ["graph/1", "map/1", "seq/1", "chart/1"]
assert receipt["publicEditorBoundary"] is True
assert receipt["readOnly"] is True
assert receipt["destructive"] == 2
assert receipt["externalRequests"] == 0
assert receipt["pageErrors"] == []
assert receipt["bidirectional"]["iframePreserved"] is True
assert receipt["bidirectional"]["freshLoadHead"]
print(json.dumps({
    "schema": "ui-runtime-browser/2",
    "status": "PASS",
    "phase": "p2",
    "entry": "artifact-shell",
    "transport": "iframe",
    "upstream": receipt["schema"],
    "publicEditorBoundary": True,
    "freshReload": True,
}))
