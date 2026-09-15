from __future__ import annotations

import filecmp
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "packages" / "semantic-map" / "scripts" / "build-browser-example.mjs"
INPUT = ROOT / "examples" / "render.semantic-map.set-topology" / "input" / "envelope.json"


def build(out: Path, profile: str) -> None:
    completed = subprocess.run(
        [
            "node",
            str(BUILD),
            f"--input={INPUT}",
            f"--out={out}",
            "--set-topology-proof=true",
            f"--projection-profile={profile}",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def prove_profile(root: Path, profile: str) -> Path:
    first = root / f"{profile}-first"
    second = root / f"{profile}-second"
    build(first, profile)
    build(second, profile)
    for name in ("index.html", "receipt.json"):
        assert filecmp.cmp(first / name, second / name, shallow=False), f"{profile} {name} is nondeterministic"
    receipt = json.loads((first / "receipt.json").read_text(encoding="utf-8"))
    assert receipt["schema"] == "semantic-map-example-build/1"
    assert receipt["status"] == "PASS"
    html = (first / "index.html").read_text(encoding="utf-8")
    assert '"setTopologyProof":true' in html
    assert f'"setTopologyProjectionProfile":"{profile}"' in html
    return first


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="semantic-map-set-topology-example-") as name:
        root = Path(name)
        horizontal = prove_profile(root, "horizontal")
        vertical = prove_profile(root, "vertical")
        assert not filecmp.cmp(horizontal / "index.html", vertical / "index.html", shallow=False)

    print(json.dumps({
        "schema": "semantic-map-set-topology-example-reproducibility/2",
        "status": "PASS",
        "profiles": ["horizontal", "vertical"],
        "checkedInDist": False,
    }))


if __name__ == "__main__":
    main()
