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


def fixture() -> dict[str, object]:
    return json.loads((CAPABILITY / "fixtures" / "map.pass.json").read_text(encoding="utf-8"))


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
          request.value = payload;
          request.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('#request-form').requestSubmit();
        }""",
        payload,
    )


def focus_canvas(child) -> None:
    canvas = child.locator("#graph-container")
    canvas.focus()
    assert child.evaluate("() => document.activeElement === document.querySelector('#graph-container')") is True


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
    try:
        if server is not None:
            time.sleep(0.4)
        with sync_playwright() as playwright:
            launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if CHROMIUM:
                launch["executable_path"] = CHROMIUM
            browser = playwright.chromium.launch(**launch)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(entry, wait_until="networkidle", timeout=30_000)
            page.evaluate("() => { document.body.dataset.mode = 'invoke'; }")
            status = page.locator("#status")
            status.wait_for(state="attached", timeout=30_000)
            submit_request(page, fixture()["request"])
            poll(
                lambda: status.get_attribute("data-state"),
                lambda state: state in {"pass", "fail"},
                "artifact shell did not settle",
            )
            assert status.get_attribute("data-state") == "pass", status.text_content()

            frame_element = page.locator("#surface iframe[data-package='semantic-map']")
            frame_element.wait_for(state="visible", timeout=30_000)
            child = child_frame(frame_element)
            poll(
                lambda: child.evaluate("() => globalThis.semanticMapSite?.ready ?? null"),
                lambda ready: ready is True,
                "semantic map did not become ready",
            )
            assert child.evaluate("() => semanticMapSite.editor.snapshot().scene.pattern") == "map/1"

            focus_canvas(child)
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "select"

            # H/V and hold-Space are real keyboard tool controls.
            page.keyboard.press("h")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "hand"
            page.keyboard.press("v")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "select"
            page.keyboard.down("Space")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "hand"
            page.keyboard.up("Space")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "select"

            # N adds a node through the same command as the visible Add button.
            baseline_regions = child.evaluate("() => semanticMapSite.editor.store.domain.regions.size")
            page.keyboard.press("n")
            poll(
                lambda: child.evaluate("() => semanticMapSite.editor.store.domain.regions.size"),
                lambda count: count == baseline_regions + 1,
                "N shortcut did not add a region",
            )
            created_id = poll(
                lambda: child.evaluate("() => semanticMapSite.editor.adapter.selectionSnapshot().regionIds.at(0) ?? null"),
                lambda value: isinstance(value, str),
                "added region was not selected",
            )
            page.keyboard.press("Escape")

            # Undo/redo are exercised as actual Ctrl-key chords.
            page.keyboard.press("Control+z")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.has(id)", created_id),
                lambda present: present is False,
                "Ctrl+Z did not undo add",
            )
            page.keyboard.press("Control+y")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.has(id)", created_id),
                lambda present: present is True,
                "Ctrl+Y did not redo add",
            )

            # F2/Enter open maxGraph label editing; Escape cancels it.
            child.evaluate("id => semanticMapSite.editor.adapter.setSelection({ regionIds: [id], relationIds: [] })", created_id)
            focus_canvas(child)
            page.keyboard.press("F2")
            child.locator(".mxCellEditor").wait_for(state="visible", timeout=10_000)
            page.keyboard.press("Escape")
            poll(lambda: child.locator(".mxCellEditor").count(), lambda count: count == 0, "Escape did not close F2 editor")
            focus_canvas(child)
            page.keyboard.press("Enter")
            child.locator(".mxCellEditor").wait_for(state="visible", timeout=10_000)
            page.keyboard.press("Escape")
            poll(lambda: child.locator(".mxCellEditor").count(), lambda count: count == 0, "Escape did not close Enter editor")

            # Arrow and Shift+Arrow update semantic geometry in map/1.
            child.evaluate("id => semanticMapSite.editor.adapter.setSelection({ regionIds: [id], relationIds: [] })", created_id)
            focus_canvas(child)
            before = child.evaluate("id => ({ ...semanticMapSite.editor.store.domain.regions.get(id).bounds })", created_id)
            page.keyboard.press("ArrowRight")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).bounds.x", created_id),
                lambda value: value == before["x"] + 1,
                "ArrowRight did not nudge map region by 1",
            )
            page.keyboard.press("Shift+ArrowDown")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.get(id).bounds.y", created_id),
                lambda value: value == before["y"] + 10,
                "Shift+ArrowDown did not nudge map region by 10",
            )

            # Delete and Backspace both delete selection and remain undoable.
            page.keyboard.press("Delete")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.has(id)", created_id),
                lambda present: present is False,
                "Delete did not delete selection",
            )
            page.keyboard.press("Control+z")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.has(id)", created_id),
                lambda present: present is True,
                "undo did not restore deleted region",
            )
            child.evaluate("id => semanticMapSite.editor.adapter.setSelection({ regionIds: [id], relationIds: [] })", created_id)
            focus_canvas(child)
            page.keyboard.press("Backspace")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.store.domain.regions.has(id)", created_id),
                lambda present: present is False,
                "Backspace did not delete selection",
            )

            # Esc restores select tool from persistent hand mode.
            focus_canvas(child)
            page.keyboard.press("h")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "hand"
            page.keyboard.press("Escape")
            assert child.evaluate("() => semanticMapSite.editor.adapter.tool") == "select"

            assert errors == [], errors
            browser.close()

        print(json.dumps({
            "schema": "maxgraph-keyboard-shortcuts-browser-proof/1",
            "status": "PASS",
            "pattern": "map/1",
            "focusableCanvas": True,
            "toolShortcuts": ["V", "H", "Space", "Escape"],
            "editShortcuts": ["N", "Enter", "F2", "Delete", "Backspace", "Arrow", "Shift+Arrow"],
            "historyShortcuts": ["Ctrl+Z", "Ctrl+Y"],
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
