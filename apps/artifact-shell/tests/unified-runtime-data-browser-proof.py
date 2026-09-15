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


def wait_for_semantic_app(page) -> dict[str, object]:
    deadline = time.monotonic() + 30
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate("""() => globalThis.semanticMapSite
          ? { ready: semanticMapSite.ready === true, error: semanticMapSite.error ?? null, route: semanticMapSite.route ?? null }
          : null""")
        if isinstance(last, dict) and last.get("ready") is True:
            return last
        if isinstance(last, dict) and last.get("error"):
            raise AssertionError(f"semantic app failed: {last}")
        time.sleep(0.05)
    raise AssertionError(f"semantic app did not settle: {last!r}")


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
            stderr=subprocess.DEVNULL,
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
                handoff_proof = None
                for runtime in ("graph", "seq", "presentation"):
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("request", lambda request: requests.append(request.url))
                    url = f"{base}/adapters/{runtime}/index.html{fragment}"
                    page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                    proof = wait_for_proof(page, runtime)
                    mounted = proof["mounted"]
                    assert mounted["sourceId"] == "construction-evidence-service", mounted
                    assert mounted["sourceSchema"] == "business-model-semantic-jsonl/2", mounted
                    assert mounted["runtimeDataSchema"] == "business-model-runtime-data/1", mounted
                    assert page.url.endswith(fragment), page.url
                    if runtime == "graph":
                        assert mounted["pattern"] == "graph/1", mounted
                        assert mounted["handoff"] == "semantic-map-handoff/2", mounted
                        assert page.locator("svg").count() > 0
                        page.wait_for_function("() => semanticMapHandoff?.ready === true && semanticMapReview?.ready === true")
                        assert page.locator("#handoff-fab").is_enabled()
                        assert page.locator("#handoff-fab").is_visible()

                        clean = page.evaluate("""async () => {
                          const transfer = await semanticMapHandoff.buildTextTransfer();
                          const image = await semanticMapHandoff.buildImageTransfer(transfer);
                          return {
                            url: transfer.stateUrl,
                            text: transfer.clipboardText,
                            imageType: image.pngBlob.type,
                            imageBytes: image.pngBlob.size,
                            head: semanticMapRuntime.head,
                            stateHash: semanticMapRuntime.stateHash,
                            draftCount: semanticMapRuntime.draftCount(),
                          };
                        }""")
                        assert clean["url"].startswith(f"{base}/app#smap="), clean
                        assert "#data=" not in clean["url"] and "state=" not in clean["url"], clean
                        assert clean["text"].startswith("SEMANTIC-MAP/2\n"), clean
                        assert clean["imageType"] == "image/png" and clean["imageBytes"] > 1000, clean
                        assert clean["draftCount"] == 0, clean

                        target = page.evaluate("""() => {
                          const regions = semanticMapSite.editor.snapshot().domain.regions;
                          return regions.find((item) => item.parent !== null)?.id ?? null;
                        }""")
                        assert target, "graph handoff proof needs one editable region"
                        shared_label = "canonical-smap-handoff-proof"
                        base_identity = page.evaluate("() => ({ head: semanticMapRuntime.head, stateHash: semanticMapRuntime.stateHash, log: semanticMapRuntime.log })")
                        page.evaluate(
                            "([regionId, label]) => semanticMapSite.editor.operation({ type: 'RenameRegion', regionId, label })",
                            [target, shared_label],
                        )
                        page.wait_for_function(
                            "([regionId, label]) => semanticMapSite.editor.snapshot().domain.regions.some((item) => item.id === regionId && item.label === label)",
                            arg=[target, shared_label],
                        )
                        draft = page.evaluate("() => ({ count: semanticMapRuntime.draftCount(), head: semanticMapRuntime.head, stateHash: semanticMapRuntime.stateHash, log: semanticMapRuntime.log })")
                        assert draft["count"] == 1, draft
                        assert draft["head"] == base_identity["head"] and draft["stateHash"] == base_identity["stateHash"] and draft["log"] == base_identity["log"], draft

                        opened = page.evaluate("() => semanticMapHandoff.open()")
                        assert opened is False
                        pending = page.evaluate("""() => {
                          const value = semanticMapReview.pending();
                          return {
                            local: value?.local ?? null,
                            source: value?.source ?? null,
                            head: semanticMapRuntime.head,
                            stateHash: semanticMapRuntime.stateHash,
                            log: semanticMapRuntime.log,
                          };
                        }""")
                        assert pending["local"] is True and pending["source"] == "local", pending
                        assert pending["head"] == base_identity["head"] and pending["stateHash"] == base_identity["stateHash"] and pending["log"] == base_identity["log"], pending

                        accepted = page.evaluate("""async () => {
                          const result = await semanticMapReview.acceptPending();
                          semanticMapReview.close();
                          const transfer = await semanticMapHandoff.buildTextTransfer();
                          const image = await semanticMapHandoff.buildImageTransfer(transfer);
                          return {
                            reviewUrl: result.url,
                            url: transfer.stateUrl,
                            head: semanticMapRuntime.head,
                            stateHash: semanticMapRuntime.stateHash,
                            draftCount: semanticMapRuntime.draftCount(),
                            imageType: image.pngBlob.type,
                            imageBytes: image.pngBlob.size,
                          };
                        }""")
                        assert accepted["draftCount"] == 0, accepted
                        assert accepted["head"] != base_identity["head"], accepted
                        assert accepted["stateHash"] != base_identity["stateHash"], accepted
                        assert accepted["reviewUrl"].startswith(f"{base}/app#smap="), accepted
                        assert accepted["url"].startswith(f"{base}/app#smap="), accepted
                        assert "#data=" not in accepted["url"] and "state=" not in accepted["url"], accepted
                        assert accepted["imageType"] == "image/png" and accepted["imageBytes"] > 1000, accepted

                        fresh = context.new_page()
                        fresh.on("pageerror", lambda error: errors.append(str(error)))
                        fresh.on("request", lambda request: requests.append(request.url))
                        fresh.goto(accepted["url"], wait_until="domcontentloaded", timeout=30_000)
                        fresh_site = wait_for_semantic_app(fresh)
                        assert fresh_site["route"] == "app", fresh_site
                        recovered = fresh.evaluate(
                            "([regionId]) => ({ label: semanticMapSite.editor.store.domain.regions.get(regionId)?.label ?? null, head: semanticMapRuntime.head, stateHash: semanticMapRuntime.stateHash, draftCount: semanticMapRuntime.draftCount(), pattern: semanticMapRuntime.view.pattern })",
                            [target],
                        )
                        assert recovered["label"] == shared_label, recovered
                        assert recovered["pattern"] == "graph/1", recovered
                        assert recovered["head"] == accepted["head"] and recovered["stateHash"] == accepted["stateHash"], recovered
                        assert recovered["draftCount"] == 0, recovered
                        assert fresh.url.startswith(f"{base}/app#smap="), fresh.url
                        fresh.close()
                        handoff_proof = {
                            "schema": "semantic-map-handoff/2",
                            "canonicalRoute": "/app",
                            "draftBlockedUntilReview": True,
                            "acceptedStateRecovered": True,
                            "headRecovered": True,
                            "stateHashRecovered": True,
                            "imageType": accepted["imageType"],
                            "imageBytes": accepted["imageBytes"],
                            "parallelStateFragment": False,
                        }
                    elif runtime == "seq":
                        assert mounted["pattern"] == "seq/1", mounted
                        assert mounted["handoff"] == "semantic-map-handoff/2", mounted
                        assert page.locator("svg").count() > 0
                        page.wait_for_function("() => semanticMapHandoff?.ready === true && semanticMapReview?.ready === true")
                    else:
                        assert mounted["schema"] == "ui-presentation-runtime/1", mounted
                        assert page.locator(".profiled-app").count() > 0
                        assert page.locator(".seq-mount .semantic-map-feature[data-feature='seq']").count() == 1
                        assert page.locator(".seq-mount svg").count() > 0
                        assert page.locator(".seq-svg").count() == 0
                        state = page.evaluate("() => uiFeatureProof.mounted.read()")
                        assert state["currentStageIndex"] == 0, state
                        assert state["seq"]["pattern"] == "seq/1", state
                        assert state["seq"]["focusMarker"] == "act-t0-provider", state
                        page.locator(".profiled-timeline button").nth(1).click()
                        page.wait_for_function("() => uiFeatureProof.mounted.read().currentStageIndex === 1")
                        state = page.evaluate("() => uiFeatureProof.mounted.read()")
                        assert state["seq"]["focusMarker"] == "act-t1-customer", state
                    observed[runtime] = {
                        "sourceId": mounted["sourceId"],
                        "sourceSchema": mounted["sourceSchema"],
                        "runtimeDataSchema": mounted["runtimeDataSchema"],
                        "pattern": mounted.get("pattern"),
                    }
                    page.close()
                assert handoff_proof is not None
                assert len({value["sourceId"] for value in observed.values()}) == 1
                assert len({value["sourceSchema"] for value in observed.values()}) == 1
                assert errors == [], errors
                unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
                assert unexpected == [], unexpected
                browser.close()
            print(json.dumps({
                "schema": "unified-runtime-data-browser-proof/5",
                "status": "PASS",
                "source": str(SOURCE.relative_to(ROOT)),
                "sourceBytes": len(source_bytes),
                "sameFragment": True,
                "presentationSeqOwner": "semantic-map/surface-runtime",
                "handoff": handoff_proof,
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
