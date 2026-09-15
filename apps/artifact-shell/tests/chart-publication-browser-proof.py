from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")
VARIANTS = (
    ("bar-horizontal", "bar-horizontal/1", "examples/chart/bar-horizontal.jsonl"),
    ("bar-vertical", "bar-vertical/1", "examples/chart/bar-vertical.jsonl"),
    ("line", "line/1", "examples/chart/line.jsonl"),
    ("pie", "pie/1", "examples/chart/pie.jsonl"),
    ("donut", "donut/1", "examples/chart/donut.jsonl"),
    ("scatter", "scatter/1", "examples/chart/scatter.jsonl"),
    ("heatmap", "heatmap/1", "examples/chart/heatmap.jsonl"),
    ("sunburst", "sunburst/1", "examples/chart/sunburst.jsonl"),
)


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def poll(read, accept, message: str, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = read()
        if accept(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f"{message}: {last!r}")


def build_publication(output: Path) -> None:
    completed = subprocess.run(
        [
            "node",
            str(ROOT / "apps" / "artifact-shell" / "scripts" / "build-publication.mjs"),
            f"--out={output}",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def encode_data(source: Path, base: str) -> str:
    script = """
import fs from 'node:fs/promises';
import { createUrlModuleUrl } from './packages/url-module/src/index.mjs';
const value = await fs.readFile(process.env.SOURCE_PATH, 'utf8');
console.log(await createUrlModuleUrl({ base: process.env.BASE_URL, fragment: 'data', value }));
"""
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        env={**os.environ, "SOURCE_PATH": str(source), "BASE_URL": base},
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout
    return completed.stdout.strip()


def replace_region_label(source: Path, region_id: str, label: str, output: Path) -> None:
    rows = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
    changed = False
    for row in rows:
        if row.get("type") == "region" and row.get("id") == region_id:
            row["label"] = label
            changed = True
            break
    assert changed, f"region not found in source: {region_id}"
    output.write_text(
        "\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n",
        encoding="utf-8",
    )


def assert_feature_pass(page, variant_id: str, errors: list[str], phase: str) -> None:
    proof = page.evaluate("() => globalThis.uiFeatureProof ?? null")
    fatal = page.locator("#fatal").text_content()
    assert proof and proof.get("status") == "PASS", (
        f"{variant_id} {phase}: feature host failed: proof={proof!r}; fatal={fatal!r}; pageErrors={errors!r}"
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="chart-publication-browser-") as temporary_name:
        temporary = Path(temporary_name)
        publication = temporary / "publication"
        build_publication(publication)

        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=publication,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}"
        errors: list[str] = []
        input_json_requests: list[str] = []
        receipts: list[dict[str, object]] = []
        negative_controls = {"missingSelection": False, "missingRoute": False}

        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if CHROMIUM:
                    launch["executable_path"] = CHROMIUM
                browser = playwright.chromium.launch(**launch)
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("request", lambda request: input_json_requests.append(request.url) if "input.json" in request.url else None)

                first_url: str | None = None
                for variant_id, chart_type, relative_source in VARIANTS:
                    source = ROOT / relative_source
                    route = f"{base}/adapters/chart/{variant_id}/"
                    url = encode_data(source, route)
                    first_url = first_url or url
                    page.goto(url, wait_until="networkidle", timeout=30_000)
                    poll(
                        lambda: page.evaluate("() => globalThis.uiFeatureProof?.status ?? null"),
                        lambda status: status in {"PASS", "FAIL"},
                        f"{variant_id}: feature host did not settle",
                    )
                    assert_feature_pass(page, variant_id, errors, "initial")
                    assert page.evaluate("() => semanticMapSite.ready") is True
                    assert page.evaluate("() => semanticMapSite.editor.snapshot().scene.pattern") == "chart/1"
                    assert page.evaluate("() => uiFeatureProof.feature.view.chart.type") == chart_type

                    editable_id = page.evaluate(
                        """() => {
                          const item = semanticMapSite.editor.adapter.lastScene.representations.find(candidate =>
                            !candidate.readOnly && !candidate.isGuide && !candidate.isRoot && candidate.labelEditable
                          );
                          return item ? (item.sourceRegionId ?? item.regionId) : null;
                        }"""
                    )
                    assert isinstance(editable_id, str), f"{variant_id}: editable chart region required"
                    original_label = page.evaluate(
                        "id => semanticMapSite.editor.store.domain.regions.get(id).label",
                        editable_id,
                    )
                    assert isinstance(original_label, str) and original_label

                    missing_selection_blocked = page.evaluate(
                        """() => {
                          const adapter = semanticMapSite.editor.adapter;
                          adapter.setSelection({ regionIds: [], relationIds: [] });
                          return adapter.startEditingSelection() === false;
                        }"""
                    )
                    assert missing_selection_blocked is True
                    negative_controls["missingSelection"] = True

                    selected = page.evaluate(
                        """id => {
                          const adapter = semanticMapSite.editor.adapter;
                          adapter.setSelection({ regionIds: [id], relationIds: [] });
                          return adapter.selectionSnapshot().regionIds.includes(id);
                        }""",
                        editable_id,
                    )
                    assert selected is True, f"{variant_id}: editable region selection failed"
                    assert page.evaluate("() => semanticMapSite.editor.adapter.startEditingSelection()") is True
                    page.locator(".mxCellEditor").wait_for(state="visible", timeout=10_000)

                    edited_label = f"{original_label} · edited"
                    page.keyboard.press("Control+a")
                    page.keyboard.type(edited_label)
                    page.keyboard.press("Enter")
                    poll(
                        lambda: page.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).label", editable_id),
                        lambda label: label == edited_label,
                        f"{variant_id}: maxGraph label edit did not commit",
                    )

                    page.keyboard.press("Control+z")
                    poll(
                        lambda: page.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).label", editable_id),
                        lambda label: label == original_label,
                        f"{variant_id}: Ctrl+Z did not undo label edit",
                    )
                    page.keyboard.press("Control+y")
                    poll(
                        lambda: page.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).label", editable_id),
                        lambda label: label == edited_label,
                        f"{variant_id}: Ctrl+Y did not redo label edit",
                    )
                    page.keyboard.press("Control+z")
                    poll(
                        lambda: page.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).label", editable_id),
                        lambda label: label == original_label,
                        f"{variant_id}: final undo did not restore source label",
                    )

                    updated_label = f"{original_label} · reloaded"
                    updated_source = temporary / f"{variant_id}.updated.jsonl"
                    replace_region_label(source, editable_id, updated_label, updated_source)
                    updated_url = encode_data(updated_source, route)
                    page.goto(updated_url, wait_until="networkidle", timeout=30_000)
                    poll(
                        lambda: page.evaluate("() => globalThis.uiFeatureProof?.status ?? null"),
                        lambda status: status in {"PASS", "FAIL"},
                        f"{variant_id}: updated #data did not settle",
                    )
                    assert_feature_pass(page, variant_id, errors, "updated-data")
                    assert page.evaluate(
                        "id => semanticMapSite.editor.store.domain.regions.get(id).label",
                        editable_id,
                    ) == updated_label
                    assert page.evaluate(
                        "label => document.body.textContent.includes(label)",
                        updated_label,
                    ) is True, f"{variant_id}: updated #data label was not rendered"

                    receipts.append({
                        "variant": variant_id,
                        "chartType": chart_type,
                        "regionId": editable_id,
                        "edit": True,
                        "undoRedo": True,
                        "updatedDataReload": True,
                    })

                assert first_url is not None
                feature_json = publication / "adapters" / "chart" / "bar-horizontal" / "feature.json"
                hidden = feature_json.with_suffix(".json.negative-control")
                feature_json.rename(hidden)
                try:
                    page.goto(first_url, wait_until="domcontentloaded", timeout=30_000)
                    poll(
                        lambda: page.evaluate("() => globalThis.uiFeatureProof?.status ?? null"),
                        lambda status: status == "FAIL",
                        "negative control: missing chart route did not fail closed",
                    )
                    negative_controls["missingRoute"] = True
                finally:
                    hidden.rename(feature_json)

                browser.close()

            assert len(receipts) == 8, receipts
            assert errors == [], errors
            assert input_json_requests == [], input_json_requests
            assert all(negative_controls.values()), negative_controls
            print(json.dumps({
                "schema": "chart-publication-browser-proof/1",
                "status": "PASS",
                "variants": receipts,
                "variantCount": len(receipts),
                "hashOnly": True,
                "inputJsonRequests": 0,
                "negativeControls": negative_controls,
                "base": base,
            }, ensure_ascii=False))
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
