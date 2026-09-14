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
SOURCE = ROOT / "examples" / "shared" / "business-model.jsonl"
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def encoded_hash() -> str:
    code = """
import fs from 'node:fs/promises';
import { createUrlModuleUrl } from './packages/url-module/src/index.mjs';
const value = await fs.readFile(process.argv[1], 'utf8');
const href = await createUrlModuleUrl({ base: 'https://runtime-data.invalid/', fragment: 'data', value });
process.stdout.write(new URL(href).hash);
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code, str(SOURCE)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    fragment = result.stdout.strip()
    assert fragment.startswith("#data="), fragment
    return fragment


def wait_for_proof(page, runtime: str) -> dict[str, object]:
    deadline = time.monotonic() + 30
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate("() => globalThis.uiFeatureProof ?? null")
        if isinstance(last, dict) and last.get("status") in {"PASS", "FAIL"}:
            assert last["status"] == "PASS", f"{runtime}: {last}"
            return last
        time.sleep(0.05)
    raise AssertionError(f"{runtime}: feature proof did not settle: {last!r}")


def main() -> None:
    fragment = encoded_hash()
    source_bytes = SOURCE.read_bytes()
    errors: list[str] = []
    requests: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ui-unified-runtime-data-") as temp:
        publication = Path(temp) / "publication"
        built = subprocess.run(
            ["node", "apps/artifact-shell/scripts/build-publication.mjs", f"--out={publication}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        receipt = json.loads(built.stdout)
        assert receipt["status"] == "PASS"
        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=publication,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}"
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if CHROMIUM:
                    launch["executable_path"] = CHROMIUM
                browser = playwright.chromium.launch(**launch)
                context = browser.new_context(viewport={"width": 1280, "height": 900})
                observed: dict[str, dict[str, object]] = {}
                for runtime in ("graph", "seq", "presentation"):
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("request", lambda request: requests.append(request.url))
                    url = f"{base}/adapters/{runtime}/index.html{fragment}"
                    page.goto(url, wait_until="networkidle", timeout=30_000)
                    proof = wait_for_proof(page, runtime)
                    mounted = proof["mounted"]
                    assert mounted["sourceId"] == "construction-evidence-service", mounted
                    assert mounted["sourceSchema"] == "business-model-semantic-jsonl/2", mounted
                    assert mounted["runtimeDataSchema"] == "business-model-runtime-data/1", mounted
                    if runtime == "graph":
                        assert mounted["pattern"] == "graph/1", mounted
                        assert page.locator("svg").count() > 0
                    elif runtime == "seq":
                        assert mounted["pattern"] == "seq/1", mounted
                        assert page.locator("svg").count() > 0
                    else:
                        assert mounted["schema"] == "ui-presentation-runtime/1", mounted
                        assert page.locator(".profiled-app").count() > 0
                    assert page.url.endswith(fragment), page.url
                    observed[runtime] = {
                        "sourceId": mounted["sourceId"],
                        "sourceSchema": mounted["sourceSchema"],
                        "runtimeDataSchema": mounted["runtimeDataSchema"],
                        "pattern": mounted.get("pattern"),
                    }
                    page.close()
                assert len({value["sourceId"] for value in observed.values()}) == 1
                assert len({value["sourceSchema"] for value in observed.values()}) == 1
                assert errors == [], errors
                unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
                assert unexpected == [], unexpected
                browser.close()
            print(json.dumps({
                "schema": "unified-runtime-data-browser-proof/1",
                "status": "PASS",
                "source": str(SOURCE.relative_to(ROOT)),
                "sourceBytes": len(source_bytes),
                "sameFragment": True,
                "runtimes": observed,
                "externalRequests": 0,
            }, ensure_ascii=False))
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
