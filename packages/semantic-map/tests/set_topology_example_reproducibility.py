from __future__ import annotations

import filecmp
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "packages" / "semantic-map" / "scripts" / "build-browser-example.mjs"
INPUT = ROOT / "examples" / "render.semantic-map.set-topology" / "input" / "envelope.json"
EXPECTED = ROOT / "examples" / "render.semantic-map.set-topology" / "dist"


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


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="semantic-map-set-topology-example-") as name:
        root = Path(name)
        horizontal = root / "horizontal"
        build(horizontal, "horizontal")
        assert filecmp.cmp(horizontal / "index.html", EXPECTED / "index.html", shallow=False)
        assert filecmp.cmp(horizontal / "receipt.json", EXPECTED / "receipt.json", shallow=False)
        shutil.rmtree(horizontal)

        vertical = root / "vertical"
        build(vertical, "vertical")
        assert filecmp.cmp(vertical / "index.html", EXPECTED / "vertical.html", shallow=False)

    print(json.dumps({
        "schema": "semantic-map-set-topology-example-reproducibility/1",
        "status": "PASS",
        "files": 3,
    }))


if __name__ == "__main__":
    main()
