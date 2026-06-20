from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

SEMANTIC_FIELDS = (
    "t",
    "currentPurpose",
    "guard",
    "guardText",
    "nextOwner",
    "visibleNodes",
    "visibleEdges",
    "roleNodeCount",
    "responsibilityComposition",
    "lastEvent",
    "metaOrder",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def source_golden_html(root: Path = ROOT) -> str:
    source = root / "golden" / "source"
    shell = (source / "ui-shell.html").read_text(encoding="utf-8")
    return (
        shell.replace("__CSS__", (source / "ui.css").read_text(encoding="utf-8"))
        .replace("__CORE__", (source / "model-core.js").read_text(encoding="utf-8"))
        .replace("__RENDERER__", (source / "ui-renderer.js").read_text(encoding="utf-8"))
    )


def candidate_html(root: Path = ROOT) -> str:
    path = root / "dist" / "purpose-atlas-v6-a2ui-ui-refactor.preview.html"
    if not path.exists():
        raise FileNotFoundError(f"standalone candidate is missing: {path}")
    return path.read_text(encoding="utf-8")


def semantic_projection(state: dict[str, Any]) -> dict[str, Any]:
    return {field: state.get(field) for field in SEMANTIC_FIELDS}


def round_box(box: dict[str, float] | None) -> dict[str, float] | None:
    if box is None:
        return None
    return {key: round(float(value), 3) for key, value in box.items()}
