from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path

from playwright.sync_api import Request, Route, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
APP = "/apps/semantic-intent/index.html"


def free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def result(intent_id: str, local_state: str, github_state: str, **extra: object) -> str:
    payload: dict[str, object] = {
        "schema": "semantic.intent.result.v1",
        "intent_id": intent_id,
        "local_state": local_state,
        "github_state": github_state,
        **extra,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    listen = free_port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    page_errors: list[str] = []
    intent_bodies: list[str] = []
    modes = iter(["abort", "pending", "applied", "rejected", "permanent_failure"])

    def route_intent(route: Route, request: Request) -> None:
        raw = request.post_data or ""
        intent_bodies.append(raw)
        intent = json.loads(raw)
        mode = next(modes)
        if mode == "abort":
            route.abort()
            return
        if mode == "pending":
            response_body = result(
                intent["intent_id"],
                "accepted",
                "pending",
                receipt_id="receipt-browser-1",
            )
        elif mode == "applied":
            response_body = result(
                intent["intent_id"],
                "accepted",
                "applied",
                issue_number=198,
                receipt_id="receipt-browser-2",
            )
        elif mode == "rejected":
            response_body = result(
                intent["intent_id"],
                "rejected",
                "not_started",
                receipt_id="receipt-browser-3",
            )
        else:
            response_body = result(
                intent["intent_id"],
                "accepted",
                "permanent_failure",
                receipt_id="receipt-browser-4",
            )
        route.fulfill(status=200, content_type="application/json", body=response_body)

    try:
        time.sleep(0.3)
        with sync_playwright() as playwright:
            launch: dict[str, object] = {
                "headless": True,
                "args": ["--no-sandbox", "--disable-dev-shm-usage"],
            }
            if executable:
                launch["executable_path"] = executable
            browser = playwright.chromium.launch(**launch)
            context = browser.new_context(viewport={"width": 960, "height": 800})
            page = context.new_page()
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.route("**/api/intents", route_intent)
            url = f"http://127.0.0.1:{listen}{APP}"

            page.goto(url, wait_until="networkidle", timeout=30_000)
            assert intent_bodies == [], "page load must not submit an intent"
            page.reload(wait_until="networkidle", timeout=30_000)
            assert intent_bodies == [], "refresh/render/import must not submit an intent"
            assert page.locator("#topic-id").input_value() == ""
            assert page.locator("#topic-title").input_value() == ""
            assert page.locator("#body").input_value() == ""

            page.locator("#topic-id").fill("ui-198")
            page.locator("#topic-title").fill("最小意味論ログ")
            page.locator("#body").fill("最小の意味論ログを記録する。")
            page.locator("#submit-intent").click()
            page.locator("#transport-state[data-state='unknown']").wait_for(timeout=10_000)
            assert page.locator("#local-state").get_attribute("data-state") == "unknown"
            assert page.locator("#github-state").get_attribute("data-state") == "unknown"
            assert not page.locator("#retry-intent").is_hidden()

            page.locator("#retry-intent").click()
            page.locator("#github-state[data-state='pending']").wait_for(timeout=10_000)
            assert page.locator("#local-state").get_attribute("data-state") == "accepted"
            assert len(intent_bodies) == 2
            assert intent_bodies[0] == intent_bodies[1], "retry must reuse byte-identical prepared request"
            assert json.loads(intent_bodies[0])["intent_id"] == json.loads(intent_bodies[1])["intent_id"]
            assert page.locator("#topic-title").input_value() == "", "accepted first event retires the first-topic title"

            page.locator("#body").fill("GitHub applied stateを表示する。")
            page.locator("#submit-intent").click()
            page.locator("#github-state[data-state='applied']").wait_for(timeout=10_000)
            assert page.locator("#issue-identity").inner_text() == "#198"
            applied_request = json.loads(intent_bodies[2])
            assert applied_request["intent_id"] != json.loads(intent_bodies[1])["intent_id"]
            assert "topic_title" not in applied_request, "subsequent topic event omits the create-only title"

            page.locator("#body").fill("Local reject stateを表示する。")
            page.locator("#submit-intent").click()
            page.locator("#local-state[data-state='rejected']").wait_for(timeout=10_000)
            assert page.locator("#github-state").get_attribute("data-state") == "not_started"

            page.locator("#body").fill("GitHub permanent failure stateを表示する。")
            page.locator("#submit-intent").click()
            page.locator("#github-state[data-state='permanent_failure']").wait_for(timeout=10_000)
            assert page.locator("#local-state").get_attribute("data-state") == "accepted"

            assert page.locator(
                "[name='endpoint'], [name='repository'], [name='issue_number'], [name='path']"
            ).count() == 0
            assert page_errors == []
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    print(json.dumps({
        "status": "semantic-intent-static-browser-proof-pass",
        "intentRequests": len(intent_bodies),
        "loadEffects": 0,
        "retryBytesStable": intent_bodies[0] == intent_bodies[1],
        "subsequentTitleOmitted": "topic_title" not in json.loads(intent_bodies[2]),
        "visibleStates": [
            "transport_unknown",
            "local_accepted_github_pending",
            "github_applied",
            "local_rejected",
            "github_permanent_failure",
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
