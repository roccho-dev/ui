from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CAPABILITY = ROOT / "apps" / "artifact-shell" / "capabilities" / "render-semantic-map"
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")


def fixture(name: str) -> dict[str, object]:
    return json.loads((CAPABILITY / "fixtures" / name).read_text(encoding="utf-8"))


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def child_frame(locator):
    handle = locator.element_handle()
    assert handle is not None
    frame = handle.content_frame()
    assert frame is not None
    return frame


def submit_request(page, request: dict[str, object]) -> None:
    payload = json.dumps(request, ensure_ascii=False)
    page.evaluate(
        """payload => {
          const request = document.querySelector('#request');
          const form = document.querySelector('#request-form');
          request.value = payload;
          request.dispatchEvent(new Event('input', { bubbles: true }));
          form.requestSubmit();
        }""",
        payload,
    )


def main() -> None:
    listen = port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    errors: list[str] = []
    requests: list[str] = []
    try:
        time.sleep(0.4)
        with sync_playwright() as playwright:
            launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if CHROMIUM:
                launch["executable_path"] = CHROMIUM
            browser = playwright.chromium.launch(**launch)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            base = f"http://127.0.0.1:{listen}"
            page.goto(f"{base}/apps/artifact-shell/index.html", wait_until="networkidle", timeout=30_000)
            status = page.locator("#status")
            status.wait_for(state="attached", timeout=30_000)
            assert status.get_attribute("data-state") == "idle"

            proven: list[str] = []
            for name, pattern in (("graph.pass.json", "graph/1"), ("map.pass.json", "map/1"), ("seq.pass.json", "seq/1")):
                current = fixture(name)
                submit_request(page, current["request"])
                page.wait_for_function("document.querySelector('#status')?.dataset.state === 'pass'", timeout=30_000)
                frame_element = page.locator("#surface iframe[data-package='semantic-map']")
                frame_element.wait_for(state="attached", timeout=30_000)
                child = child_frame(frame_element)
                child.wait_for_function("globalThis.semanticMapSite?.ready === true")
                child.locator("[data-maxgraph-active-list]").wait_for(state="visible", timeout=30_000)
                region_button = child.locator("[data-maxgraph-active-list] button[data-active-key^='region:']").first
                region_button.wait_for(state="visible", timeout=30_000)
                active_key = region_button.get_attribute("data-active-key")
                assert active_key and active_key.startswith("region:")
                region_id = active_key.split(":", 1)[1]
                region_button.click()
                child.wait_for_function(
                    "([id]) => semanticMapSite.editor.adapter.selectionSnapshot().regionIds.includes(id)",
                    arg=[region_id],
                )
                snapshot = child.evaluate("() => semanticMapSite.editor.adapter.activeList.snapshot()")
                assert snapshot["visible"] is True
                assert len(snapshot["items"]) > 0
                assert f"region:{region_id}" in snapshot["selected"]
                assert child.evaluate("() => semanticMapSite.editor.snapshot().scene.pattern") == pattern
                proven.append(pattern)

            assert errors == [], f"page errors: {errors}"
            unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
            assert unexpected == [], f"unexpected external requests: {unexpected}"
            browser.close()
        print(json.dumps({
            "schema": "maxgraph-active-list-browser-proof/1",
            "status": "PASS",
            "patterns": proven,
            "selectionFromList": True,
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
