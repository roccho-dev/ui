from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "examples" / "presentation" / "presentation.jsonl"
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def build_preview(output: Path) -> None:
    completed = subprocess.run(
        ["npm", "--prefix", "apps/preview", "run", "build", "--", f"--outDir={output}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def wait_for_proof(page, runtime: str) -> dict[str, object]:
    deadline = time.monotonic() + 30
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate("() => globalThis.uiPreviewProof ?? null")
        if isinstance(last, dict) and last.get("status") in {"PASS", "FAIL"}:
            assert last["status"] == "PASS", f"{runtime}: {last}"
            return last
        time.sleep(0.05)
    raise AssertionError(f"{runtime}: preview proof did not settle: {last!r}")


def main() -> None:
    source_bytes = SOURCE.read_bytes()
    errors: list[str] = []
    requests: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ui-preview-design-data-") as temp:
        preview = Path(temp) / "dist"
        build_preview(preview)
        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=preview,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}"
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if CHROMIUM:
                    launch["executable_path"] = CHROMIUM
                browser = playwright.chromium.launch(**launch)
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                launcher = context.new_page()
                launcher.on("pageerror", lambda error: errors.append(str(error)))
                launcher.on("request", lambda request: requests.append(request.url))
                launcher.goto(base, wait_until="domcontentloaded", timeout=30_000)
                wait_for_proof(launcher, "launcher")
                links = {
                    item["id"]: item["href"]
                    for item in launcher.locator("#cases a").evaluate_all(
                        "nodes => nodes.map(node => ({id: node.textContent, href: node.href}))"
                    )
                }
                assert all(runtime in links for runtime in ("graph", "seq", "presentation", "control")), links
                assert urlparse(links["graph"]).fragment == urlparse(links["seq"]).fragment, "Graph and Seq must share one encoded semantic input"
                launcher.close()

                observed: dict[str, dict[str, object]] = {}
                for runtime in ("graph", "seq", "presentation", "control"):
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("request", lambda request: requests.append(request.url))
                    page.goto(links[runtime], wait_until="domcontentloaded", timeout=30_000)
                    proof = wait_for_proof(page, runtime)
                    mounted = proof["mounted"]
                    if runtime in ("graph", "seq"):
                        assert mounted["sourceId"] == "construction-evidence-service", mounted
                        assert mounted["sourceSchema"] == "business-model-semantic-jsonl/2", mounted
                        assert mounted["runtimeDataSchema"] == "business-model-runtime-data/1", mounted
                        assert mounted["pattern"] == f"{runtime}/1", mounted
                        assert page.locator("svg").count() > 0
                    elif runtime == "presentation":
                        assert mounted["schema"] == "ui-presentation-runtime/1", mounted
                        assert mounted["sourceId"] == "construction-evidence-service", mounted
                        assert mounted["sourceSchema"] == "business-model-semantic-jsonl/2", mounted
                        assert page.locator(".profiled-app").count() == 1
                        assert page.locator(".seq-mount .semantic-map-feature[data-feature='seq']").count() == 1
                        assert page.locator(".seq-mount svg").count() > 0
                        state = page.evaluate("() => uiPreviewProof.mounted.read()")
                        assert state["currentStageIndex"] == 0, state
                        assert state["seq"]["focusMarker"] == "act-t0-provider", state
                        page.locator(".profiled-timeline button").nth(1).click()
                        page.wait_for_function("() => uiPreviewProof.mounted.read().currentStageIndex === 1")
                        state = page.evaluate("() => uiPreviewProof.mounted.read()")
                        assert state["seq"]["focusMarker"] == "act-t1-customer", state
                    else:
                        assert mounted["schema"] == "ui-control-runtime/3", mounted
                        assert page.locator("[data-a2ui-component='TreeGrid']").count() == 1
                        assert page.locator("[data-a2ui-component='Tree']").count() == 0
                        root_row = page.locator("[data-control-row='/root']")
                        left_root = root_row.locator(":scope > [data-control-column='control']").inner_text()
                        right_root = root_row.locator(":scope > [data-control-column='claims']").inner_text()
                        assert "schema: 3" in left_root and "rel:" not in left_root, left_root
                        assert "op: report" in right_root and "by: d" in right_root and "rel:" not in right_root, right_root
                    observed[runtime] = {"schema": mounted.get("schema"), "sourceId": mounted.get("sourceId")}
                    page.close()

                assert errors == [], errors
                unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
                assert unexpected == [], unexpected
                browser.close()
            print(json.dumps({
                "schema": "ui-preview-design-data-browser-proof/1",
                "status": "PASS",
                "source": str(SOURCE.relative_to(ROOT)),
                "sourceBytes": len(source_bytes),
                "graphSeqSameFragment": True,
                "designDataApps": ["presentation", "control"],
                "runtimes": observed,
                "externalRequests": 0,
            }, ensure_ascii=False))
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
