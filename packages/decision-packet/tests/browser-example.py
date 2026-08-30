from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
HTML = ROOT / "examples" / "render.decision-packet" / "dist" / "index.html"
PACKET = ROOT / "examples" / "render.decision-packet" / "input" / "decision-packet.json"


def install_test_crypto(page) -> None:
    page.expose_function("__decisionPacketTestSha256", lambda values: list(hashlib.sha256(bytes(values)).digest()))
    page.evaluate(
        """() => {
          let uuidSequence = 0;
          Object.defineProperty(crypto, 'subtle', {
            configurable: true,
            value: { digest: async (_algorithm, input) => Uint8Array.from(
              await __decisionPacketTestSha256([...new Uint8Array(input)])
            ).buffer },
          });
          Object.defineProperty(crypto, 'randomUUID', {
            configurable: true,
            value: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
          });
        }"""
    )


def main() -> None:
    packet = json.loads(PACKET.read_text(encoding="utf-8"))
    html = HTML.read_text(encoding="utf-8")
    errors: list[str] = []
    requests: list[str] = []
    executable = os.environ.get("CHROMIUM_EXECUTABLE", "/usr/bin/chromium")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=executable,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            device_scale_factor=1,
        )
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url))
        install_test_crypto(page)
        page.set_content(html, wait_until="load")
        page.wait_for_function("globalThis.semanticMapSite?.ready === true", timeout=30_000)
        rendered = page.evaluate(
            """() => ({
              pattern: semanticMapRuntime.view.pattern,
              title: semanticMapRuntime.records.find(record => record.type === 'meta')?.title,
              recommendation: semanticMapRuntime.records.find(record => record.id === 'recommendation')?.summary,
              trace: semanticMapRuntime.records.find(record => record.id === 'trace')?.summary,
              svg: Boolean(document.querySelector('#graph-container svg')),
              editorReady: Boolean(semanticMapSite.editor?.ready),
              sourceReady: Boolean(semanticMapSource?.ready),
              handoffReady: Boolean(semanticMapHandoff?.ready),
              reviewReady: Boolean(semanticMapReview?.ready),
            })"""
        )
        assert rendered["pattern"] == "graph/1"
        assert rendered["title"] == packet["title"]
        assert rendered["recommendation"] == packet["recommendation"]
        assert packet["packet_digest"] in rendered["trace"]
        assert all(rendered[key] for key in ("svg", "editorReady", "sourceReady", "handoffReady", "reviewReady"))
        unexpected = [url for url in requests if url.startswith(("http://", "https://"))]
        assert unexpected == [], f"unexpected external requests: {unexpected}"
        context.close()
        browser.close()
    assert errors == [], f"browser page errors: {errors}"
    print(json.dumps({
        "schema": "decision-packet-semantic-map-browser-proof/1",
        "status": "PASS",
        "decisionId": packet["decision_id"],
        "packetDigest": packet["packet_digest"],
        "pattern": "graph/1",
        "externalRequests": 0,
        "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
