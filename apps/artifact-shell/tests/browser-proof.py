from __future__ import annotations

import hashlib
import json
import os
import socket
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CAPABILITY = ROOT / "apps" / "artifact-shell" / "capabilities" / "render-semantic-map"


def fixture(name: str) -> dict[str, object]:
    return json.loads((CAPABILITY / "fixtures" / name).read_text(encoding="utf-8"))


def port() -> int:
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
        except Exception as error:  # frame navigation can briefly invalidate the context
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
    listen = port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
        cwd=ROOT,
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
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            base = f"http://127.0.0.1:{listen}"
            page.goto(f"{base}/apps/artifact-shell/index.html", wait_until="networkidle", timeout=30_000)
            page.locator("#status[data-state='idle']").wait_for(timeout=30_000)

            patterns: list[str] = []
            bidirectional: dict[str, object] | None = None
            for name, pattern in (
                ("graph.pass.json", "graph/1"),
                ("map.pass.json", "map/1"),
                ("seq.pass.json", "seq/1"),
                ("chart.pass.json", "chart/1"),
            ):
                current = fixture(name)
                page.locator("#request").fill(json.dumps(current["request"], ensure_ascii=False))
                page.locator("#run").click()
                page.locator("#status[data-state='pass']").wait_for(timeout=30_000)
                result = json.loads(page.locator("#result").inner_text())
                assert result["status"] == "PASS"
                assert [item["contract"] for item in result["outputs"]] == ["semantic-map-render-receipt/1"]
                assert result["outputs"][0]["value"]["pattern"] == pattern
                assert "render.semantic-map@1" in page.locator("#progress").inner_text()
                frame_element = page.locator("#surface iframe[data-package='semantic-map']")
                frame_element.wait_for(state="attached", timeout=30_000)
                child = child_frame(frame_element)
                wait_js(child, "globalThis.semanticMapSite?.ready === true")
                rendered = child.evaluate(
                    """() => ({
                      pattern: semanticMapRuntime.view.pattern,
                      scene: semanticMapSite.editor.snapshot().scene.pattern,
                      svg: Boolean(document.querySelector('#graph-container svg')),
                      editorReady: Boolean(semanticMapSite.editor?.ready),
                    })"""
                )
                assert rendered == {"pattern": pattern, "scene": pattern, "svg": True, "editorReady": True}
                patterns.append(pattern)
                if pattern == "graph/1":
                    for api in ("semanticMapHandoff", "semanticMapReview", "semanticMapSource"):
                        wait_js(child, f"globalThis.{api}?.ready === true")
                    controls = child.evaluate(
                        """() => ({
                          pattern: !document.getElementById('pattern-select').disabled,
                          source: !document.getElementById('source-open').disabled,
                          handoff: !document.getElementById('handoff-fab').disabled,
                          embedded: semanticMapArtifactModule.read().embedded,
                        })"""
                    )
                    assert controls == {"pattern": True, "source": True, "handoff": True, "embedded": False}
                    bridge_receipt = result["outputs"][0]["value"]["inputBridge"]
                    assert bridge_receipt == {
                        "enabled": True,
                        "history": "replace",
                        "inputId": "map",
                        "mode": "parent-invocation",
                        "schema": "semantic-map-input-bridge-receipt/1",
                    }
                    initial_parent_url = page.url
                    child.evaluate(
                        """() => {
                          globalThis.__artifactShellBridgeSentinel = 'alive';
                          semanticMapSite.editor.adapter.setCamera(1.2, 12, 34);
                          semanticMapSite.editor.adapter.setSelection({ regionIds: ['request'], relationIds: [] });
                        }"""
                    )
                    accepted = child.evaluate(
                        """async () => {
                          semanticMapSite.editor.operation({
                            type: 'MoveRegions',
                            regionIds: ['request'],
                            dx: 5,
                            dy: 0,
                          });
                          const proposal = await semanticMapSite.runtime.createDraftProposal();
                          const result = await semanticMapSite.runtime.accept(proposal);
                          return {
                            head: result.decisionId,
                            log: result.log,
                            stateHash: result.stateHash,
                          };
                        }"""
                    )
                    wait_js(page, f"location.href !== {json.dumps(initial_parent_url)}")
                    wait_js(child, "globalThis.semanticMapInputBridge?.snapshot().revisions >= 1")
                    assert "#invoke=" in page.url
                    assert page.locator("#status").get_attribute("data-state") == "pass"
                    assert child.evaluate("() => globalThis.__artifactShellBridgeSentinel") == "alive"
                    preserved = child.evaluate(
                        """() => ({
                          camera: semanticMapSite.editor.snapshot().camera,
                          selection: semanticMapSite.editor.snapshot().selection,
                          bridge: semanticMapInputBridge.snapshot(),
                        })"""
                    )
                    assert preserved["camera"] == {"scale": 1.2, "translateX": 12, "translateY": 34}
                    assert preserved["selection"] == {"regionIds": ["request"], "relationIds": []}
                    assert preserved["bridge"] == {
                        "enabled": True,
                        "inputId": "map",
                        "lastError": None,
                        "revisions": 1,
                    }
                    parent_request = json.loads(page.locator("#request").input_value())
                    assert parent_request["inputs"][0]["source"]["value"]["log"] == accepted["log"]

                    shared_url = page.url
                    fresh = context.new_page()
                    fresh.on("pageerror", lambda error: errors.append(str(error)))
                    fresh.on("request", lambda request: requests.append(request.url))
                    fresh.goto(shared_url, wait_until="networkidle", timeout=30_000)
                    fresh.locator("#status[data-state='pass']").wait_for(timeout=30_000)
                    fresh_frame_element = fresh.locator("#surface iframe[data-package='semantic-map']")
                    fresh_frame_element.wait_for(state="attached", timeout=30_000)
                    fresh_child = child_frame(fresh_frame_element)
                    wait_js(fresh_child, "globalThis.semanticMapSite?.ready === true")
                    assert fresh_child.evaluate("() => semanticMapSite.runtime.head") == accepted["head"]
                    assert fresh_child.evaluate("() => semanticMapSite.runtime.stateHash") == accepted["stateHash"]
                    fresh.close()
                    bidirectional = {
                        "history": "replace",
                        "iframePreserved": True,
                        "freshLoadHead": accepted["head"],
                        "parentUrlChars": len(shared_url),
                    }

            immutable = fixture("graph.pass.json")
            immutable_value = immutable["request"]["inputs"][0]["source"]["value"]
            canonical = json.dumps(immutable_value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            immutable["request"]["inputs"][0]["digest"] = f"sha256:{hashlib.sha256(canonical).hexdigest()}"
            page.locator("#request").fill(json.dumps(immutable["request"], ensure_ascii=False))
            page.locator("#run").click()
            page.locator("#status[data-state='pass']").wait_for(timeout=30_000)
            immutable_result = json.loads(page.locator("#result").inner_text())
            assert immutable_result["outputs"][0]["value"]["inputBridge"] == {
                "enabled": False,
                "history": None,
                "inputId": "map",
                "mode": "read-only",
                "schema": "semantic-map-input-bridge-receipt/1",
            }
            immutable_frame_element = page.locator("#surface iframe[data-package='semantic-map'][data-input-action='read-only']")
            immutable_frame_element.wait_for(state="attached", timeout=30_000)
            immutable_child = child_frame(immutable_frame_element)
            wait_js(immutable_child, "globalThis.semanticMapSite?.ready === true")
            immutable_state = immutable_child.evaluate(
                """async () => {
                  const controls = [
                    'pattern-select', 'source-open', 'handoff-fab', 'review-accept', 'review-reject',
                  ].map(id => document.getElementById(id).disabled);
                  let runtimeError = null;
                  try { await semanticMapSite.runtime.accept({}); } catch (error) { runtimeError = error.message; }
                  const beforeDrafts = semanticMapSite.runtime.draftCount();
                  const operationResult = semanticMapSite.editor.operation({
                    type: 'MoveRegions', regionIds: ['request'], dx: 5, dy: 0,
                  });
                  const afterDrafts = semanticMapSite.runtime.draftCount();
                  return { afterDrafts, beforeDrafts, controls, operationResult, runtimeError };
                }"""
            )
            assert immutable_state["controls"] == [True, True, True, True, True]
            assert "input is read-only" in immutable_state["runtimeError"]
            assert immutable_state["operationResult"] is None
            assert immutable_state["beforeDrafts"] == 0
            assert immutable_state["afterDrafts"] == 0

            for name in ("schema.destructive.json", "tampered.destructive.json"):
                current = fixture(name)
                page.locator("#request").fill(json.dumps(current["request"], ensure_ascii=False))
                page.locator("#run").click()
                page.locator("#status[data-state='fail']").wait_for(timeout=30_000)
                result = json.loads(page.locator("#result").inner_text())
                assert result["status"] == "FAIL" and result["outputs"] == []

            assert errors == [], f"page errors: {errors}"
            unexpected = [url for url in requests if url.startswith(("http://", "https://")) and not url.startswith(base)]
            assert unexpected == [], f"unexpected external requests: {unexpected}"
            context.close()
            browser.close()
        print(json.dumps({
            "schema": "artifact-shell-semantic-map-browser-proof/1",
            "status": "PASS",
            "patterns": patterns,
            "bidirectional": bidirectional,
            "readOnly": True,
            "destructive": 2,
            "externalRequests": 0,
            "pageErrors": errors,
        }, ensure_ascii=False))
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
