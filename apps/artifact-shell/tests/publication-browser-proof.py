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


def free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def wait_js(frame, expression: str, timeout: int = 30_000) -> None:
    deadline = time.monotonic() + timeout / 1000
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if frame.evaluate(f"() => Boolean({expression})"):
                return
        except Exception as error:
            last_error = error
        time.sleep(0.05)
    suffix = f": {last_error}" if last_error else ""
    raise AssertionError(f"timed out waiting for {expression}{suffix}")


def child_frame(locator):
    handle = locator.element_handle()
    assert handle is not None
    frame = handle.content_frame()
    assert frame is not None
    return frame


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ui-publication-") as directory:
        output = Path(directory) / "dist"
        build = subprocess.run(
            ["node", "apps/artifact-shell/scripts/build-publication.mjs", f"--out={output}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        receipt = json.loads(build.stdout.strip().splitlines()[-1])
        assert receipt["status"] == "PASS"
        assert receipt["adapters"] == ["graph", "map", "seq", "presentation", "control", "graph-editor"]

        listen = free_port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=output,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        errors: list[str] = []
        requests: list[str] = []
        executable = os.environ.get("CHROMIUM_EXECUTABLE")
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if executable:
                    launch["executable_path"] = executable
                browser = playwright.chromium.launch(**launch)
                context = browser.new_context(viewport={"width": 1365, "height": 960})
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("request", lambda request: requests.append(request.url))
                base = f"http://127.0.0.1:{listen}"

                page.goto(f"{base}/index.html", wait_until="domcontentloaded", timeout=30_000)
                page.locator("body[data-mode='launcher']").wait_for(timeout=30_000)
                labels = page.locator("#launcher a").all_text_contents()
                assert labels == ["graph", "map", "seq", "presentation", "control", "graph-editor"]

                patterns: dict[str, str] = {}
                for feature, pattern in (("graph", "graph/1"), ("map", "map/1"), ("seq", "seq/1")):
                    page.goto(f"{base}/adapters/{feature}/index.html", wait_until="domcontentloaded", timeout=30_000)
                    page.locator("body[data-adapter-status='pass']").wait_for(timeout=30_000)
                    outer = page.locator(f"iframe[data-adapter-frame='{feature}']")
                    outer.wait_for(state="visible", timeout=30_000)
                    shell = child_frame(outer)
                    wait_js(shell, "globalThis.artifactShellProof?.outcome?.result?.status === 'PASS'")
                    semantic = shell.locator("#surface iframe[data-package='semantic-map']")
                    semantic.wait_for(state="attached", timeout=30_000)
                    rendered = child_frame(semantic)
                    wait_js(rendered, "globalThis.semanticMapSite?.ready === true")
                    state = rendered.evaluate(
                        """() => ({
                          pattern: semanticMapRuntime.view.pattern,
                          svg: Boolean(document.querySelector('#graph-container svg')),
                          editorReady: Boolean(semanticMapSite.editor?.ready),
                        })"""
                    )
                    assert state == {"pattern": pattern, "svg": True, "editorReady": True}
                    patterns[feature] = pattern

                page.goto(f"{base}/adapters/presentation/index.html", wait_until="domcontentloaded", timeout=30_000)
                page.locator("html[data-status='pass']").wait_for(timeout=30_000)
                page.locator("#surface").wait_for(state="visible", timeout=30_000)
                page.locator("#seq-shell").wait_for(state="visible", timeout=30_000)
                assert page.locator("#seq-mount svg").count() == 1
                assert page.locator("#surface").inner_text().strip()

                page.goto(f"{base}/adapters/control/index.html", wait_until="domcontentloaded", timeout=30_000)
                page.locator("html[data-status='pass']").wait_for(timeout=30_000)
                page.locator("#tree .node").first.wait_for(state="visible", timeout=30_000)
                assert page.locator("#tree .node").count() > 0
                assert page.locator("#status").inner_text() == "loaded"

                page.goto(f"{base}/adapters/graph-editor/index.html", wait_until="domcontentloaded", timeout=30_000)
                page.locator("html[data-status='pass']").wait_for(timeout=30_000)
                page.locator(".roccho-graph-editor").wait_for(state="visible", timeout=30_000)
                page.locator(".roccho-graph-editor__canvas svg").wait_for(state="visible", timeout=30_000)
                assert page.locator(".roccho-graph-editor__projection li").count() > 0
                assert page.locator(".roccho-graph-editor__status").inner_text() == "Loaded"

                assert errors == [], f"page errors: {errors}"
                unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
                assert unexpected == [], f"unexpected external requests: {unexpected}"
                context.close()
                browser.close()

            print(json.dumps({
                "schema": "artifact-shell-publication-browser-proof/1",
                "status": "PASS",
                "rootLinks": 6,
                "patterns": patterns,
                "realFeatures": ["presentation", "control", "graph-editor"],
                "externalRequests": 0,
                "pageErrors": errors,
                "treeDigest": receipt["treeDigest"],
            }, ensure_ascii=False))
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
