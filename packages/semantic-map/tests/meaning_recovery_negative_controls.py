from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]
SCHEMA = "semantic-meaning-recovery-negative-controls/1"


@dataclass(frozen=True)
class Control:
    name: str
    relative: str
    old: str
    new: str
    test: str
    marker: str


CONTROLS = (
    Control("persist-set-drag-coordinates", "authoring/set-topology-bridge.js", "  return recoverSetTopologyOperation(operation, context);", "  return directMeaningCandidate([operation]);", "map_semantics_test.mjs", "MUTATION:set-topology-semantic-bridge"),
    Control("collapse-ambiguous-meaning-to-candidate", "authoring/meaning-recovery.js", "  if (possibleMeanings.length > 1 || changedMeanings.length > 1) {", "  if (false) {", "meaning_recovery_test.mjs", "MUTATION:meaning-recovery-ambiguity"),
    Control("drop-meaning-recovery-validity-gates", "authoring/meaning-recovery.js", "  return Boolean(item && item.error === null && item.roundtrip && item.preserves);", "  return Boolean(item);", "meaning_recovery_test.mjs", "MUTATION:meaning-recovery-validity-gates"),
    Control("ignore-moved-set-topology-orientation", "authoring/set-topology-bridge.js", "  if (pair.left === movedId) return pair.topology;", "  return pair.topology;", "map_semantics_test.mjs", "MUTATION:set-topology-moved-orientation"),
    Control("remove-set-topology-position-tolerance", "authoring/set-topology-bridge.js", "export const SET_TOPOLOGY_SCREEN_TOLERANCE = 4;", "export const SET_TOPOLOGY_SCREEN_TOLERANCE = 0;", "map_semantics_test.mjs", "MUTATION:set-topology-robustness-neighborhood"),
    Control("collapse-topology-neighborhood-to-observed", "authoring/set-topology-bridge.js", "    possibleMeanings: neighborhood.possible,", "    possibleMeanings: [neighborhood.exact],", "map_semantics_test.mjs", "MUTATION:set-topology-robustness-neighborhood"),
    Control("ignore-set-topology-semantic-invariant", "authoring/set-topology-bridge.js", "      error: error.message,", "      error: null, roundtrip: true, preserves: true,", "map_semantics_test.mjs", "MUTATION:set-topology-semantic-invariant"),
)


def run(package: Path, test: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(package / "tests" / test)],
        cwd=package.parent.parent,
        text=True,
        capture_output=True,
        timeout=180,
        check=False,
    )


def mutate(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{path}: expected one mutation target, found {count}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def main() -> None:
    for test in ("meaning_recovery_test.mjs", "map_semantics_test.mjs"):
        result = run(PACKAGE, test)
        assert result.returncode == 0, result.stdout + result.stderr

    results = []
    with tempfile.TemporaryDirectory(prefix="semantic-map-meaning-controls-") as name:
        target = Path(name) / "packages" / "semantic-map"
        target.parent.mkdir(parents=True)
        shutil.copytree(PACKAGE, target)
        for control in CONTROLS:
            path = target / control.relative
            original = path.read_bytes()
            try:
                mutate(path, control.old, control.new)
                result = run(target, control.test)
                output = result.stdout + result.stderr
                assert result.returncode != 0, f"mutation survived: {control.name}"
                assert control.marker in output, f"expected marker missing for {control.name}: {output[-1000:]}"
                results.append({"name": control.name, "status": "KILLED", "exitCode": result.returncode})
            finally:
                path.write_bytes(original)

    print(json.dumps({
        "schema": SCHEMA,
        "status": "PASS",
        "baselineGateCount": 2,
        "controlCount": len(results),
        "survivors": 0,
        "controls": results,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
