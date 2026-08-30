from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CAPABILITY = ROOT / "apps" / "artifact-shell" / "capabilities" / "render-decision-packet"


def fixture(name: str) -> dict[str, object]:
    return json.loads((CAPABILITY / "fixtures" / name).read_text(encoding="utf-8"))


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


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
    executable = os.environ.get("CHROMIUM_EXECUTABLE", "/usr/bin/chromium")
    try:
        time.sleep(0.4)
        with sync_playwright() as playwright:
            launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if executable and Path(executable).exists():
                launch["executable_path"] = executable
            browser = playwright.chromium.launch(**launch)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            base = f"http://127.0.0.1:{listen}"
            page.goto(f"{base}/apps/artifact-shell/index.html", wait_until="networkidle", timeout=30_000)
            page.locator("#status[data-state='idle']").wait_for(timeout=30_000)

            current = fixture("public.pass.json")
            page.locator("#request").fill(json.dumps(current["request"], ensure_ascii=False))
            page.locator("#run").click()
            page.locator("#status[data-state='pass']").wait_for(timeout=30_000)
            result = json.loads(page.locator("#result").inner_text())
            assert result["status"] == "PASS"
            assert [item["contract"] for item in result["outputs"]] == ["decision-packet-render-receipt/1"]
            receipt = result["outputs"][0]["value"]
            assert receipt["map"]["pattern"] == "graph/1"
            assert "render.decision-packet@1" in page.locator("#progress").inner_text()
            frame_element = page.locator("#surface iframe[data-package='semantic-map']")
            frame_element.wait_for(state="attached", timeout=30_000)
            element = frame_element.element_handle()
            assert element is not None
            child = element.content_frame()
            assert child is not None
            child.locator("#graph-container svg").wait_for(state="attached", timeout=30_000)
            rendered = child.evaluate(
                """() => ({
                  ready: globalThis.semanticMapSite?.ready === true,
                  pattern: semanticMapRuntime.view.pattern,
                  title: semanticMapRuntime.records.find(record => record.type === 'meta')?.title,
                  recommendation: semanticMapRuntime.records.find(record => record.id === 'recommendation')?.summary,
                  svg: Boolean(document.querySelector('#graph-container svg')),
                  editorReady: Boolean(semanticMapSite.editor?.ready),
                })"""
            )
            assert rendered["ready"] is True
            assert rendered["pattern"] == "graph/1"
            assert rendered["title"] == current["request"]["inputs"][0]["source"]["value"]["title"]
            assert rendered["recommendation"] == current["request"]["inputs"][0]["source"]["value"]["recommendation"]
            assert rendered["svg"] is True and rendered["editorReady"] is True

            for name in ("private.destructive.json", "malformed.destructive.json", "tampered.destructive.json"):
                broken = fixture(name)
                page.locator("#request").fill(json.dumps(broken["request"], ensure_ascii=False))
                page.locator("#run").click()
                page.locator("#status[data-state='fail']").wait_for(timeout=30_000)
                failed = json.loads(page.locator("#result").inner_text())
                assert failed["status"] == "FAIL" and failed["outputs"] == []

            assert errors == [], f"page errors: {errors}"
            unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
            assert unexpected == [], f"unexpected external requests: {unexpected}"
            context.close()
            browser.close()
        print(json.dumps({
            "schema": "artifact-shell-decision-packet-browser-proof/1",
            "status": "PASS",
            "destructive": 3,
            "externalRequests": 0,
            "pageErrors": errors,
        }, ensure_ascii=False))
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
