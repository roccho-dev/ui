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
EXPECTED_NODES = 129
STAGING_BASE = "feat/opt-manually-and-beautifully"


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def prove_control_page(page: Page) -> dict[str, object]:
    page.wait_for_function("document.documentElement.dataset.status === 'pass'", timeout=30_000)
    panes = page.locator("[data-a2ui-component='Pane']")
    assert panes.count() == 2
    titles = panes.locator(".pane-title").all_text_contents()
    assert titles == ["control.jsonl", "claims.jsonl"]

    left = page.locator("[data-a2ui-id='control-tree']")
    right = page.locator("[data-a2ui-id='claims-tree']")
    left_nodes = left.locator(".node").count()
    right_nodes = right.locator(".node").count()
    assert left_nodes == right_nodes == EXPECTED_NODES
    final_report = right.locator("[data-control-id='evidence.015'] > .row").inner_text()
    assert "op: report" in final_report
    assert "state: active" in final_report
    assert "by: d" in final_report

    overflows = page.eval_on_selector_all(
        ".pane,.tree,.children",
        "els => els.map(el => getComputedStyle(el).overflowY)",
    )
    assert all(value not in ("auto", "scroll") for value in overflows)

    toggle = left.locator("[data-control-id='ui'] > .row .relation-toggle")
    toggle.click()
    hidden = page.eval_on_selector_all(
        "[data-control-id='ui'] > [data-control-relation='details']",
        "els => els.map(el => el.hidden)",
    )
    assert hidden == [True, True]
    return {"left": left_nodes, "right": right_nodes, "total": left_nodes + right_nodes}


def deployed_control_url(page: Page, pr_number: int) -> str:
    alias = f"https://stg-t271-s{pr_number}.ui-runtime.pages.dev/"
    page.goto(alias, wait_until="networkidle", timeout=30_000)
    href = page.locator("a[href*='adapters/control/#data=']").first.get_attribute("href")
    assert href, "deployed control launcher #data route required"
    return urljoin(alias, href)


def staging_pull_request_number() -> int | None:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        return None
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    pull_request = event.get("pull_request", {})
    if pull_request.get("base", {}).get("ref") != STAGING_BASE:
        return None
    value = pull_request.get("number")
    return value if isinstance(value, int) and value > 0 else None


def main() -> None:
    errors: list[str] = []
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    deployed: dict[str, object] | None = None
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
                local = prove_control_page(page)

                pr_number = staging_pull_request_number()
                if pr_number is not None:
                    deployed_page = browser.new_page(viewport={"width": 1280, "height": 900})
                    deployed_page.on("pageerror", lambda error: errors.append(str(error)))
                    deployed_page.goto(deployed_control_url(deployed_page, pr_number), wait_until="networkidle", timeout=30_000)
                    deployed = prove_control_page(deployed_page)
                    deployed["url"] = f"https://stg-t271-s{pr_number}.ui-runtime.pages.dev/"
                    deployed_page.close()

                assert errors == [], f"page errors: {errors}"
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=5)

    print(json.dumps({
        "schema": "ui.control-browser-proof/2",
        "status": "PASS",
        "panes": 2,
        "nodesPerPane": EXPECTED_NODES,
        "renderedNodes": local["total"],
        "scrollOwners": 1,
        "claims": "report",
        "deployed": deployed,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
