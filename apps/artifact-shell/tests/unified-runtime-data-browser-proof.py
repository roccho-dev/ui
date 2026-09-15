from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def wait_for_proof(page: Page, runtime: str) -> dict[str, object]:
    deadline = time.monotonic() + 30
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate("() => globalThis.uiFeatureProof ?? null")
        if isinstance(last, dict) and last.get("status") in {"PASS", "FAIL"}:
            assert last["status"] == "PASS", f"{runtime}: {last}"
            return last
        time.sleep(0.05)
    raise AssertionError(f"{runtime}: feature proof did not settle: {last!r}")


def launcher_routes(index: str) -> dict[str, str]:
    routes: dict[str, str] = {}
    for runtime in ("graph", "seq", "presentation"):
        match = re.search(rf'href="(adapters/{runtime}/#data=[^"]+)"', index)
        assert match, f"{runtime}: launcher #data route required"
        routes[runtime] = match.group(1)
    return routes


def main() -> None:
    errors: list[str] = []
    requests: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ui-unified-runtime-data-") as temp:
        publication = Path(temp) / "publication"
        built = subprocess.run(
            ["node", "apps/artifact-shell/scripts/build-publication.mjs", f"--out={publication}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        receipt = json.loads(built.stdout)
        assert receipt["status"] == "PASS"
        routes = launcher_routes((publication / "index.html").read_text(encoding="utf-8"))
        graph_fragment = routes["graph"].split("#", 1)[1]
        seq_fragment = routes["seq"].split("#", 1)[1]
        presentation_fragment = routes["presentation"].split("#", 1)[1]
        assert graph_fragment == seq_fragment, "Graph and Seq must receive the same semantic #data"
        assert presentation_fragment != graph_fragment, "Presentation #data must include design + semantic data"

        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=publication,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}/"
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if CHROMIUM:
                    launch["executable_path"] = CHROMIUM
                browser = playwright.chromium.launch(**launch)
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                observed: dict[str, dict[str, object]] = {}

                for runtime in ("graph", "seq", "presentation"):
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("request", lambda request: requests.append(request.url))
                    page.goto(urljoin(base, routes[runtime]), wait_until="domcontentloaded", timeout=30_000)
                    proof = wait_for_proof(page, runtime)
                    mounted = proof["mounted"]
                    assert mounted["sourceId"] == "construction-evidence-service", mounted
                    assert mounted["sourceSchema"] == "business-model-semantic-jsonl/2", mounted
                    assert mounted["runtimeDataSchema"] == "business-model-runtime-data/1", mounted

                    if runtime == "graph":
                        assert mounted["pattern"] == "graph/1", mounted
                        assert mounted["handoff"] == "semantic-map-handoff/2", mounted
                        assert page.locator("svg").count() > 0
                        page.wait_for_function("() => semanticMapHandoff?.ready === true && semanticMapReview?.ready === true")
                        handoff = page.evaluate("""async () => {
                          const transfer = await semanticMapHandoff.buildTextTransfer();
                          const image = await semanticMapHandoff.buildImageTransfer(transfer);
                          return { url: transfer.stateUrl, imageType: image.pngBlob.type, imageBytes: image.pngBlob.size };
                        }""")
                        assert handoff["url"].startswith(f"http://127.0.0.1:{listen}/app#smap="), handoff
                        assert "#data=" not in handoff["url"] and "state=" not in handoff["url"], handoff
                        assert handoff["imageType"] == "image/png" and handoff["imageBytes"] > 1000, handoff
                    elif runtime == "seq":
                        assert mounted["pattern"] == "seq/1", mounted
                        assert mounted["handoff"] == "semantic-map-handoff/2", mounted
                        assert page.locator("svg").count() > 0
                    else:
                        assert mounted["schema"] == "ui-presentation-runtime/1", mounted
                        assert page.locator(".profiled-app").count() == 1
                        assert page.locator(".seq-mount .semantic-map-feature[data-feature='seq']").count() == 1
                        assert page.locator(".seq-mount svg").count() > 0
                        state = page.evaluate("() => uiFeatureProof.mounted.read()")
                        assert state["currentStageIndex"] == 0, state
                        assert state["seq"]["pattern"] == "seq/1", state
                        assert state["seq"]["focusMarker"] == "act-t0-provider", state
                        page.locator(".profiled-timeline button").nth(1).click()
                        page.wait_for_function("() => uiFeatureProof.mounted.read().currentStageIndex === 1")
                        state = page.evaluate("() => uiFeatureProof.mounted.read()")
                        assert state["seq"]["focusMarker"] == "act-t1-customer", state

                    observed[runtime] = {
                        "sourceId": mounted["sourceId"],
                        "sourceSchema": mounted["sourceSchema"],
                        "runtimeDataSchema": mounted["runtimeDataSchema"],
                        "pattern": mounted.get("pattern"),
                    }
                    page.close()

                assert len({value["sourceId"] for value in observed.values()}) == 1
                assert len({value["sourceSchema"] for value in observed.values()}) == 1
                assert errors == [], errors
                unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
                assert unexpected == [], unexpected
                browser.close()

            print(json.dumps({
                "schema": "unified-runtime-data-browser-proof/6",
                "status": "PASS",
                "graphSeqSameData": True,
                "presentationDesignData": True,
                "presentationSeqOwner": "semantic-map/surface-runtime",
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
