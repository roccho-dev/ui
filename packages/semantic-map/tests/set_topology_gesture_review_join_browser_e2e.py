from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_e2e_support import load_app

ROOT = Path(__file__).resolve().parents[3]
HTML = ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html"
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE", "/usr/bin/chromium")


def free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def build_preview(output: Path) -> None:
    completed = subprocess.run(
        ["npm", "--prefix", "apps/preview", "run", "build", "--", f"--outDir={output}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def data_fragment(envelope: dict[str, object]) -> str:
    code = """
import { createUrlModuleUrl } from './packages/url-module/src/index.mjs';
let text = '';
for await (const chunk of process.stdin) text += chunk;
const value = JSON.parse(text);
const href = await createUrlModuleUrl({ base: 'https://semantic-replay.invalid/', fragment: 'data', value });
process.stdout.write(new URL(href).hash);
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code],
        cwd=ROOT,
        input=json.dumps(envelope, ensure_ascii=False),
        check=True,
        capture_output=True,
        text=True,
    )
    fragment = result.stdout.strip()
    assert fragment.startswith("#data="), fragment
    return fragment


def wait_preview(page) -> None:
    page.wait_for_function(
        "() => globalThis.uiPreviewProof?.status === 'PASS' || globalThis.uiPreviewProof?.status === 'FAIL'",
        timeout=30_000,
    )
    proof = page.evaluate("() => globalThis.uiPreviewProof")
    assert proof["status"] == "PASS", proof
    page.wait_for_function("() => globalThis.semanticMapRuntime?.ready === true", timeout=30_000)
    page.wait_for_function("() => globalThis.semanticMapReview?.ready === true", timeout=30_000)


def snapshot(page):
    return page.evaluate(
        """() => {
          const state = semanticMapApp.snapshot();
          return {
            head: semanticMapRuntime.head,
            stateHash: semanticMapRuntime.stateHash,
            log: semanticMapRuntime.log,
            records: structuredClone(semanticMapRuntime.records),
            view: structuredClone(semanticMapRuntime.view),
            draft: semanticMapRuntime.draftOperations(),
            topology: state.scene?.setOverlay?.pairs?.[0]?.topology ?? null,
            rawBounds: Object.fromEntries(
              state.domain.regions
                .filter((item) => item.kind === 'set')
                .map((item) => [item.id, item.bounds])
            ),
            overlay: semanticMapApp.adapter.reviewOverlaySnapshot(),
            pending: Boolean(semanticMapReview.pending()),
          };
        }"""
    )


def move_to_overlap(page):
    page.evaluate(
        """async () => {
          const state = semanticMapApp.snapshot();
          const targets = Object.fromEntries(
            state.presentationProjection.interactions.map((item) => [item.regionId, item.bounds])
          );
          const a = targets.a;
          const b = targets.b;
          const cell = semanticMapApp.adapter.cellsByRegionId.get('b');
          semanticMapApp.adapter.graph.moveCells(
            [cell],
            a.x + a.width - 12 - b.x,
            a.y - b.y,
          );
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }"""
    )
    page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'candidate'")
    page.wait_for_function("semanticMapRuntime.draftCount() === 2")
    page.wait_for_function(
        "semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'"
    )


def open_review(page, reason):
    return page.evaluate(
        """async (reason) => {
          const graphCounts = {
            cells: semanticMapApp.adapter.cellsByRegionId.size,
            edges: semanticMapApp.adapter.edgesByProjectionKey.size,
          };
          await semanticMapReview.openDraft({
            reason,
            sourceRefs: ['https://github.com/roccho-dev/ui/issues/171', 'sha256:gesture-review-join'],
            assessment: 'Proposal only; accepted meaning changes only through Accept.',
          });
          const pending = semanticMapReview.pending();
          const layer = document.querySelector('[data-layer=semantic-review]');
          return {
            graphCounts,
            model: structuredClone(pending.model),
            overlay: semanticMapApp.adapter.reviewOverlaySnapshot(),
            rendered: {
              layerCount: document.querySelectorAll('[data-layer=semantic-review]').length,
              pointerEvents: getComputedStyle(layer).pointerEvents,
              operations: [...document.querySelectorAll('#review-diff li')]
                .map((item) => item.dataset.operationType),
              reason: document.getElementById('review-reason').textContent,
            },
            afterGraphCounts: {
              cells: semanticMapApp.adapter.cellsByRegionId.size,
              edges: semanticMapApp.adapter.edgesByProjectionKey.size,
            },
          };
        }""",
        reason,
    )


def assert_review(review, base):
    model = review["model"]
    overlay = review["overlay"]["overlay"]
    assert model["schema"] == "semantic-map-review-model/1"
    assert model["authority"] is False and model["status"] == "proposal"
    assert model["identities"]["baseHead"] == base["head"]
    assert model["identities"]["proposalParent"] == base["head"]
    assert model["identities"]["baseStateHash"] == base["stateHash"]
    assert [entry["type"] for entry in model["trace"]] == ["RemoveSelection", "ConnectRegions"]
    assert model["delta"]["counts"]["changed"] == 2
    assert model["delta"]["counts"]["relations"]["added"] == 1
    assert model["delta"]["counts"]["relations"]["removed"] == 1
    assert overlay["schema"] == "semantic-map-review-overlay/1"
    assert overlay["authority"] is False
    assert overlay["proposalId"] == model["identities"]["proposalId"]
    assert sorted(item["status"] for item in overlay["relations"]) == ["added", "removed"]
    assert review["rendered"]["layerCount"] == 1
    assert review["rendered"]["pointerEvents"] == "none"
    assert review["rendered"]["operations"] == ["RemoveSelection", "ConnectRegions"]
    assert review["graphCounts"] == review["afterGraphCounts"]


def main() -> None:
    errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="semantic-map-gesture-replay-") as temporary_name:
        preview = Path(temporary_name) / "preview"
        build_preview(preview)
        listen = free_port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=preview,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        preview_base = f"http://127.0.0.1:{listen}"
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=CHROMIUM,
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                context = browser.new_context(viewport={"width": 1180, "height": 820})
                page = load_app(context, HTML, errors)
                page.wait_for_function("semanticMapSite.setTopologyProof === true")
                page.wait_for_function(
                    "semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'disjoint'"
                )
                base = snapshot(page)
                base_lines = len(base["log"].strip().splitlines())

                move_to_overlap(page)
                reject_review = open_review(
                    page,
                    "Review the semantic topology recovered from an actual maxGraph gesture.",
                )
                assert_review(reject_review, base)
                rejected = page.evaluate(
                    """async () => {
                      const before = semanticMapRuntime.log.split('\\n').filter(Boolean).length;
                      const result = await semanticMapReview.rejectPending();
                      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                      return {
                        result,
                        before,
                        after: semanticMapRuntime.log.split('\\n').filter(Boolean).length,
                      };
                    }"""
                )
                page.wait_for_function("semanticMapRuntime.draftCount() === 0")
                page.wait_for_function(
                    "semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'disjoint'"
                )
                after_reject = snapshot(page)
                assert rejected == {"result": True, "before": base_lines, "after": base_lines}
                assert after_reject == base

                move_to_overlap(page)
                accept_review = open_review(
                    page,
                    "Accept the semantic topology recovered from an actual maxGraph gesture.",
                )
                assert_review(accept_review, base)
                accepted = page.evaluate(
                    """async () => {
                      const before = semanticMapRuntime.log.split('\\n').filter(Boolean).length;
                      const result = await semanticMapReview.acceptPending();
                      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                      return {
                        decisionId: result.decisionId,
                        stateHash: result.stateHash,
                        url: result.url,
                        before,
                        after: semanticMapRuntime.log.split('\\n').filter(Boolean).length,
                      };
                    }"""
                )
                current = snapshot(page)
                assert accepted["before"] == base_lines and accepted["after"] == base_lines + 1
                assert current["head"] == accepted["decisionId"]
                assert current["stateHash"] == accepted["stateHash"]
                assert current["topology"] == "partial-overlap"
                assert current["rawBounds"] == base["rawBounds"]
                assert current["draft"] == []
                assert current["overlay"] == {"active": False, "overlay": None}
                assert current["pending"] is False
                assert accepted["url"] == ""

                envelope = page.evaluate("async () => await semanticMapRuntime.envelope()")
                fragment = data_fragment(envelope)
                replay = context.new_page()
                replay.on("pageerror", lambda error: errors.append(str(error)))
                replay.goto(
                    f"{preview_base}/?case=semantic/graph{fragment}",
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )
                wait_preview(replay)
                replay_state = snapshot(replay)
                assert replay_state["head"] == current["head"]
                assert replay_state["stateHash"] == current["stateHash"]
                assert replay_state["log"] == current["log"]
                assert replay_state["records"] == current["records"]
                assert replay_state["view"] == current["view"]
                assert replay_state["rawBounds"] == current["rawBounds"]
                assert replay_state["draft"] == []
                assert replay_state["overlay"] == {"active": False, "overlay": None}
                assert replay_state["pending"] is False
                assert replay.url.endswith(fragment), replay.url
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()

    assert not errors, errors
    print(json.dumps({
        "schema": "semantic-map-gesture-review-join-browser-e2e/1",
        "status": "PASS",
        "actualMaxGraphGesture": True,
        "trace": ["RemoveSelection", "ConnectRegions"],
        "rejectDecisionAppendCount": 0,
        "acceptDecisionAppendCount": 1,
        "freshJsonlReplay": True,
        "freshDataReplay": True,
        "replayHost": "apps/preview",
        "reviewOverlayAuthority": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
