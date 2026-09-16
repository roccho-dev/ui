from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import Request, Route, sync_playwright

from browser_example import build_html, fixture_envelope


def free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def main() -> None:
    errors: list[str] = []
    request_bodies: list[str] = []
    listen = free_port()

    with tempfile.TemporaryDirectory(prefix="semantic-handoff-intent-") as temporary_name:
        temporary = Path(temporary_name)
        build_dir = temporary / "graph"
        build_html(fixture_envelope("graph.pass.json"), build_dir)
        dist = build_dir / "dist"
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=dist,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )

        def route_intent(route: Route, request: Request) -> None:
            raw = request.post_data or ""
            request_bodies.append(raw)
            payload = json.loads(raw)
            assert request.method == "POST"
            assert payload["schema"] == "semantic-intent.v1"
            assert payload["kind"] == "record"
            assert "SEMANTIC-DATA/1" in payload["body"]
            assert "#data=" in payload["body"]
            assert "bounds" not in payload and "zoom" not in payload and "view" not in payload

            if len(request_bodies) == 1:
                route.abort()
                return

            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "schema": "semantic-intent.result.v1",
                        "intent_id": payload["intent_id"],
                        "local_state": "no_change",
                        "github_state": "applied",
                        "issue_number": 290,
                        "comment_id": 123456,
                        "receipt_id": "handoff-proof-001",
                    },
                    separators=(",", ":"),
                ),
            )

        try:
            time.sleep(0.25)
            executable = os.environ.get("CHROMIUM_EXECUTABLE", "/usr/bin/chromium")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=executable,
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                context = browser.new_context(viewport={"width": 1024, "height": 768})
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.route("**/api/intents", route_intent)
                page.goto(f"http://127.0.0.1:{listen}/index.html", wait_until="networkidle", timeout=30_000)
                page.wait_for_function("globalThis.semanticMapHandoff?.ready === true", timeout=30_000)

                assert request_bodies == [], "load must have zero provider effects"
                assert page.locator("#handoff-copy-image").count() == 0, "producer image handoff must stay retired"

                page.locator("#handoff-fab").click()
                page.locator("#handoff-request").fill("選択中の意味を保ったまま配置を改善して")
                page.wait_for_function(
                    "globalThis.semanticMapHandoff?.preparedSubmission?.() !== null",
                    timeout=10_000,
                )
                assert request_bodies == [], "prepare must have zero provider effects"

                prepared = page.evaluate(
                    """() => ({
                      submission: semanticMapHandoff.preparedSubmission(),
                      image: semanticMapHandoff.imageExportCapability(),
                      transfer: semanticMapHandoff.lastTextTransfer(),
                    })"""
                )
                assert prepared["image"]["supported"] is False
                assert prepared["transfer"]["imagePrepared"] is False
                assert prepared["submission"]["intent"]["topic_id"]
                assert prepared["submission"]["requestBody"] == json.dumps(
                    prepared["submission"]["intent"],
                    ensure_ascii=False,
                    separators=(",", ":"),
                )

                page.locator("#handoff-copy-text").click()
                page.wait_for_function(
                    "document.getElementById('handoff-transport-state').dataset.state === 'unknown'",
                    timeout=10_000,
                )
                assert len(request_bodies) == 1
                assert page.locator("#handoff-request").is_disabled()
                assert page.locator("#handoff-copy-text").inner_text() == "同じ内容を再送する"

                page.locator("#handoff-copy-text").click()
                page.wait_for_function(
                    "document.getElementById('handoff-github-state').dataset.state === 'applied'",
                    timeout=10_000,
                )
                assert len(request_bodies) == 2
                assert request_bodies[0] == request_bodies[1], "ambiguous retry must be byte-identical"
                assert page.locator("#handoff-local-state").get_attribute("data-state") == "no_change"
                assert page.locator("#handoff-issue-id").inner_text() == "#290 / comment 123456"
                assert not page.locator("#handoff-copy-locator").is_hidden()
                assert page.evaluate("semanticMapHandoff.lastSubmitResult().issue_number") == 290
                assert errors == [], errors
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=5)

    print(json.dumps({
        "schema": "semantic-map-handoff-intent-browser-proof/1",
        "status": "PASS",
        "postCount": len(request_bodies),
        "retryBytesStable": request_bodies[0] == request_bodies[1],
        "imageProducerRetired": True,
        "outputPort": "/api/intents",
    }))


if __name__ == "__main__":
    main()
