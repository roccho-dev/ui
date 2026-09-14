from __future__ import annotations

import base64
import gzip
import json
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
FEATURES = {
    "graph": ("graph/1", ROOT / "examples" / "graph" / "example.jsonl"),
    "map": ("map/1", ROOT / "examples" / "map" / "example.jsonl"),
    "seq": ("seq/1", ROOT / "examples" / "seq" / "example.jsonl"),
}


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def data_token(text: str) -> str:
    payload = json.dumps(text, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(payload, mtime=0)
    return base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ui-semantic-feature-") as temp:
        output = Path(temp) / "publication"
        subprocess.run(
            ["node", "apps/artifact-shell/scripts/build-publication.mjs", f"--out={output}"],
            cwd=ROOT,
            check=True,
        )
        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=output,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                receipts = []
                for feature_id, (pattern, source) in FEATURES.items():
                    page = context.new_page()
                    errors: list[str] = []
                    page.on("pageerror", lambda error, bucket=errors: bucket.append(str(error)))
                    text = source.read_text(encoding="utf-8")
                    url = f"http://127.0.0.1:{listen}/adapters/{feature_id}/#data={data_token(text)}"
                    page.goto(url, wait_until="networkidle", timeout=30_000)
                    page.locator("html[data-status='pass']").wait_for(state="attached", timeout=30_000)
                    proof = page.evaluate("() => globalThis.uiFeatureProof")
                    assert proof["feature"]["id"] == feature_id
                    assert proof["mounted"]["pattern"] == pattern
                    assert proof["mounted"]["records"] > 1
                    assert proof["mounted"]["svg"] is True
                    assert page.locator("iframe").count() == 0
                    svg = page.locator("#feature svg").first
                    assert svg.count() == 1
                    box = svg.bounding_box()
                    assert box and box["width"] > 0 and box["height"] > 0
                    assert svg.locator(":scope > *").count() > 0
                    assert "#data=" in page.url and "#smap" not in page.url and "smap-ref" not in page.url
                    assert errors == [], f"{feature_id} page errors: {errors}"
                    receipts.append({"feature": feature_id, "pattern": pattern, "records": proof["mounted"]["records"]})
                    page.close()
                context.close()
                browser.close()
            print(json.dumps({
                "schema": "semantic-map-feature-browser-proof/1",
                "status": "PASS",
                "features": receipts,
                "transport": "#data",
                "iframes": 0,
            }, ensure_ascii=False))
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
