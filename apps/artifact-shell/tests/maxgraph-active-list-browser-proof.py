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
REMOTE_BASE = os.environ.get("ARTIFACT_SHELL_BASE_URL")


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


def poll(read, accept, message: str, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = read()
        if accept(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f"{message}: {last!r}")


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


def active_state(child):
    return child.evaluate("""() => {
      const site = globalThis.semanticMapSite;
      const active = site?.editor?.adapter?.activeList?.snapshot?.() ?? null;
      const element = document.querySelector('[data-maxgraph-active-list]');
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect?.() ?? null;
      return {
        active,
        dom: element ? {
          hidden: element.hidden,
          display: style?.display ?? null,
          visibility: style?.visibility ?? null,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          buttons: element.querySelectorAll('button[data-active-key]').length,
        } : null,
      };
    }""")


def main() -> None:
    server = None
    if REMOTE_BASE:
        base = REMOTE_BASE.rstrip("/")
        entry = f"{base}/index.html"
    else:
        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}"
        entry = f"{base}/apps/artifact-shell/index.html"

    errors: list[str] = []
    requests: list[str] = []
    try:
        if server is not None:
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
            page.goto(entry, wait_until="networkidle", timeout=30_000)
            page.evaluate("() => { document.body.dataset.mode = 'invoke'; }")
            status = page.locator("#status")
            status.wait_for(state="attached", timeout=30_000)
            assert status.get_attribute("data-state") == "idle"

            proven: list[str] = []
            for name, pattern in (("graph.pass.json", "graph/1"), ("map.pass.json", "map/1"), ("seq.pass.json", "seq/1")):
                current = fixture(name)
                submit_request(page, current["request"])
                poll(
                    lambda: status.get_attribute("data-state"),
                    lambda state: state in {"pass", "fail"},
                    f"artifact shell did not settle for {pattern}",
                )
                assert status.get_attribute("data-state") == "pass", status.text_content()
                frame_element = page.locator("#surface iframe[data-package='semantic-map']")
                frame_element.wait_for(state="visible", timeout=30_000)
                child = child_frame(frame_element)
                poll(
                    lambda: child.evaluate("() => globalThis.semanticMapSite ? { ready: semanticMapSite.ready, error: semanticMapSite.error ?? null } : null"),
                    lambda value: isinstance(value, dict) and value.get("ready") in {True, False},
                    f"semantic site did not settle for {pattern}",
                )
                site = child.evaluate("() => ({ ready: semanticMapSite.ready, error: semanticMapSite.error ?? null })")
                assert site["ready"] is True, site["error"]
                state = poll(
                    lambda: active_state(child),
                    lambda value: value.get("active") is not None and bool(value["active"]["items"]),
                    f"active-list did not receive items for {pattern}",
                )
                assert state["active"]["visible"] is True, f"active-list model hidden for {pattern}: {state}"
                assert state["dom"]["hidden"] is False, f"active-list DOM hidden for {pattern}: {state}"
                assert state["dom"]["display"] != "none", f"active-list display none for {pattern}: {state}"
                assert state["dom"]["width"] > 0 and state["dom"]["height"] > 0, f"active-list has no layout box for {pattern}: {state}"
                region_button = child.locator("[data-maxgraph-active-list] button[data-active-key^='region:']").first
                region_button.wait_for(state="visible", timeout=30_000)
                active_key = region_button.get_attribute("data-active-key")
                assert active_key and active_key.startswith("region:")
                region_id = active_key.split(":", 1)[1]
                region_button.click()
                poll(
                    lambda: child.evaluate("() => semanticMapSite.editor.adapter.selectionSnapshot().regionIds"),
                    lambda ids: region_id in ids,
                    f"active-list selection did not reach maxGraph for {pattern}",
                )
                snapshot = child.evaluate("() => semanticMapSite.editor.adapter.activeList.snapshot()")
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
            "base": base,
        }, ensure_ascii=False))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
