from __future__ import annotations

import os
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def main() -> None:
    errors: list[str] = []
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    with tempfile.TemporaryDirectory(prefix="control-browser-proof-") as temp:
        output = Path(temp) / "publication"
        subprocess.run(
            ["node", "apps/artifact-shell/scripts/build-publication.mjs", f"--out={output}"],
            cwd=ROOT,
            check=True,
        )
        launcher = (output / "index.html").read_text(encoding="utf-8")
        match = re.search(r'href="(adapters/control/#data=[^"]+)"', launcher)
        assert match, "control launcher #data route required"

        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=output,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if executable:
                    launch["executable_path"] = executable
                browser = playwright.chromium.launch(**launch)
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                page.on("pageerror", lambda error: errors.append(str(error)))
                base = f"http://127.0.0.1:{listen}/"
                page.goto(urljoin(base, match.group(1)), wait_until="networkidle", timeout=30_000)
                page.wait_for_function("document.documentElement.dataset.status === 'pass'", timeout=30_000)

                panes = page.locator("[data-a2ui-component='Pane']")
                assert panes.count() == 2
                titles = panes.locator(".pane-title").all_text_contents()
                assert titles == ["control.jsonl", "claims.jsonl"]

                left = page.locator("[data-a2ui-id='control-tree']")
                right = page.locator("[data-a2ui-id='claims-tree']")
                assert left.locator(".node").count() == right.locator(".node").count() == 7
                chart_report = right.locator("[data-control-id='chart'] > .row").inner_text()
                assert "op: report" in chart_report
                assert "state: active" in chart_report
                assert "by: d" in chart_report

                overflows = page.eval_on_selector_all(
                    ".pane,.tree,.children",
                    "els => els.map(el => getComputedStyle(el).overflowY)",
                )
                assert all(value not in ("auto", "scroll") for value in overflows)

                toggle = left.locator("[data-control-id='ui'] > .row .relation-toggle")
                toggle.click()
                hidden = page.eval_on_selector_all(
                    "[data-control-id='ui'] > [data-control-relation='contains']",
                    "els => els.map(el => el.hidden)",
                )
                assert hidden == [True, True]

                assert errors == [], f"page errors: {errors}"
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=5)

    print('{"schema":"ui.control-browser-proof/1","status":"PASS","panes":2,"scrollOwners":1,"claims":"report"}')


if __name__ == "__main__":
    main()
