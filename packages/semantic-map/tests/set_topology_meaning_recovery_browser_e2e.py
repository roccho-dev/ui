from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from browser_e2e_support import load_app

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(os.environ.get("SEMANTIC_MAP_PROOF_OUTPUT", "/tmp/semantic-map-proof"))


def state(page):
    return page.evaluate(
        """() => {
          const snapshot=semanticMapApp.snapshot();
          return {
            recovery:snapshot.meaningRecovery,
            topology:snapshot.scene.setOverlay.pairs[0]?.topology ?? null,
            sets:Object.fromEntries(snapshot.scene.setOverlay.sets.map((item)=>[item.regionId,item.bounds])),
            rawBounds:Object.fromEntries(snapshot.domain.regions.filter((item)=>item.kind==='set').map((item)=>[item.id,item.bounds])),
            camera:snapshot.camera,
            draft:semanticMapRuntime.draftOperations(),
            head:semanticMapRuntime.head,
            stateHash:semanticMapRuntime.stateHash,
            log:semanticMapRuntime.log,
          };
        }"""
    )


def move(page, *, overlap: float | None = None, dx: float | None = None):
    return page.evaluate(
        """async ({overlap,dx}) => {
          const snapshot=semanticMapApp.snapshot();
          const targets=Object.fromEntries(snapshot.presentationProjection.interactions.map((item)=>[item.regionId,item.bounds]));
          const a=targets.a, b=targets.b;
          const moveX=dx ?? (a.x+a.width-overlap-b.x);
          const moveY=a.y-b.y;
          const cell=semanticMapApp.adapter.cellsByRegionId.get('b');
          semanticMapApp.adapter.graph.moveCells([cell],moveX,moveY);
          await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          return {dx:moveX,dy:moveY};
        }""",
        {"overlap": overlap, "dx": dx},
    )


def submit_move(page, *, overlap: float):
    return page.evaluate(
        """async ({overlap}) => {
          const snapshot=semanticMapApp.snapshot();
          const targets=Object.fromEntries(snapshot.presentationProjection.interactions.map((item)=>[item.regionId,item.bounds]));
          const a=targets.a, b=targets.b;
          const moveX=a.x+a.width-overlap-b.x;
          const moveY=a.y-b.y;
          semanticMapApp.operation({type:'MoveRegions',regionIds:['b'],dx:moveX,dy:moveY});
          await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          return {dx:moveX,dy:moveY};
        }""",
        {"overlap": overlap},
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(viewport={"width": 1180, "height": 820}, device_scale_factor=1)
        page = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html", errors)
        page.wait_for_function("semanticMapSite.setTopologyProof === true")
        page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'disjoint'")

        initial = state(page)
        assert initial["recovery"] is None
        assert initial["draft"] == []
        initial_head = initial["head"]
        initial_state_hash = initial["stateHash"]
        initial_log = initial["log"]
        initial_raw_bounds = initial["rawBounds"]

        initial_camera = initial["camera"]
        page.evaluate(
            "(camera) => semanticMapApp.adapter.setCamera(2, camera.translateX, camera.translateY)",
            initial_camera,
        )
        zoomed_candidate_move = submit_move(page, overlap=3)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'candidate'")
        page.wait_for_function("semanticMapRuntime.draftCount() === 2")
        zoomed_candidate = state(page)
        assert zoomed_candidate["recovery"]["evidence"]["presentationScale"] == 2
        assert zoomed_candidate["recovery"]["evidence"]["screenTolerance"] == 4
        assert zoomed_candidate["recovery"]["evidence"]["positionTolerance"] == 2
        page.evaluate("semanticMapRuntime.reject({local:true})")
        page.wait_for_function("semanticMapRuntime.draftCount() === 0")

        page.evaluate(
            "(camera) => semanticMapApp.adapter.setCamera(0.5, camera.translateX, camera.translateY)",
            initial_camera,
        )
        zoomed_review_move = submit_move(page, overlap=3)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'review'")
        zoomed_review = state(page)
        assert zoomed_review["recovery"]["evidence"]["presentationScale"] == 0.5
        assert zoomed_review["recovery"]["evidence"]["positionTolerance"] == 8
        assert zoomed_review["draft"] == []
        page.evaluate(
            "(camera) => semanticMapApp.adapter.setCamera(camera.scale, camera.translateX, camera.translateY)",
            initial_camera,
        )

        presentation_move = move(page, dx=-8)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'presentation'")
        presentation = state(page)
        assert presentation["recovery"]["reason"] == "meaning-unchanged"
        assert presentation["recovery"]["possibleMeanings"] == ["disjoint"]
        assert presentation["draft"] == []
        assert presentation["topology"] == "disjoint"
        assert presentation["head"] == initial_head
        assert presentation["stateHash"] == initial_state_hash
        assert presentation["log"] == initial_log
        assert presentation["rawBounds"] == initial_raw_bounds
        page.screenshot(path=str(OUTPUT / "meaning-recovery-presentation.png"), full_page=True)

        contact_move = move(page, overlap=0)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'review'")
        contact = state(page)
        assert contact["recovery"]["reason"] == "meaning-ambiguous"
        assert contact["recovery"]["observedMeaning"] == "disjoint"
        assert contact["recovery"]["possibleMeanings"] == ["disjoint", "partial-overlap"]
        assert contact["recovery"]["candidateMeanings"] == ["partial-overlap"]
        assert contact["recovery"]["operations"] == []
        assert [item["type"] for item in contact["recovery"]["candidates"][0]["operations"]] == [
            "RemoveSelection",
            "ConnectRegions",
        ]
        assert contact["draft"] == []
        assert contact["topology"] == "disjoint"
        assert contact["head"] == initial_head
        assert contact["stateHash"] == initial_state_hash
        assert contact["rawBounds"] == initial_raw_bounds
        page.screenshot(path=str(OUTPUT / "meaning-recovery-contact-review.png"), full_page=True)

        micro_move = move(page, overlap=1)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'review'")
        micro = state(page)
        assert micro["recovery"]["observedMeaning"] == "partial-overlap"
        assert micro["recovery"]["possibleMeanings"] == ["disjoint", "partial-overlap"]
        assert micro["draft"] == []
        assert micro["topology"] == "disjoint"
        assert micro["head"] == initial_head
        assert micro["stateHash"] == initial_state_hash
        page.screenshot(path=str(OUTPUT / "meaning-recovery-micro-overlap-review.png"), full_page=True)

        candidate_move = move(page, overlap=12)
        page.wait_for_function("semanticMapApp.snapshot().meaningRecovery?.status === 'candidate'")
        page.wait_for_function("semanticMapRuntime.draftCount() === 2")
        page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")
        candidate = state(page)
        assert candidate["recovery"]["reason"] == "unique-meaning"
        assert candidate["recovery"]["possibleMeanings"] == ["partial-overlap"]
        assert candidate["recovery"]["candidateMeanings"] == ["partial-overlap"]
        assert [item["type"] for item in candidate["recovery"]["operations"]] == [
            "RemoveSelection",
            "ConnectRegions",
        ]
        assert [item["type"] for item in candidate["draft"]] == ["RemoveSelection", "ConnectRegions"]
        assert all(item["type"] != "MoveRegions" for item in candidate["draft"])
        assert candidate["rawBounds"] == initial_raw_bounds
        page.screenshot(path=str(OUTPUT / "meaning-recovery-candidate.png"), full_page=True)

        rejected_url = page.evaluate("semanticMapRuntime.reject({local:true})")
        page.wait_for_function("semanticMapRuntime.draftCount() === 0")
        page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'disjoint'")
        after_reject = state(page)
        assert rejected_url == page.evaluate("location.href")
        assert after_reject["head"] == initial_head
        assert after_reject["stateHash"] == initial_state_hash
        assert after_reject["log"] == initial_log
        assert after_reject["rawBounds"] == initial_raw_bounds

        accepted_move = move(page, overlap=12)
        page.wait_for_function("semanticMapRuntime.draftCount() === 2")
        accepted = page.evaluate(
            """async () => {
              const proposal=await semanticMapRuntime.createDraftProposal();
              const result=await semanticMapRuntime.accept(proposal);
              await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              return result;
            }"""
        )
        page.wait_for_function("semanticMapRuntime.draftCount() === 0")
        accepted_state = state(page)
        assert accepted_state["head"] == accepted["decisionId"]
        assert accepted_state["stateHash"] == accepted["stateHash"]
        assert accepted_state["topology"] == "partial-overlap"
        assert accepted_state["rawBounds"] == initial_raw_bounds

        fragment = "#" + urlsplit(accepted["url"]).fragment
        replay = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html", errors, fragment=fragment)
        replay.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")
        replay_state = state(replay)
        assert replay_state["recovery"] is None
        assert replay_state["draft"] == []
        assert replay_state["head"] == accepted_state["head"]
        assert replay_state["stateHash"] == accepted_state["stateHash"]
        assert replay_state["log"] == accepted_state["log"]
        assert replay_state["rawBounds"] == initial_raw_bounds
        replay.screenshot(path=str(OUTPUT / "meaning-recovery-replayed.png"), full_page=True)

        browser.close()

    assert not errors, errors
    result = {
        "schema": "semantic-map-set-topology-meaning-recovery-browser-e2e/1",
        "pass": True,
        "status": "PASS",
        "skipped": False,
        "complete": True,
        "errors": [],
        "screenTolerancePx": 4,
        "zoomNormalization": {
            "scale2": {
                "move": zoomed_candidate_move,
                "status": zoomed_candidate["recovery"]["status"],
                "worldTolerance": zoomed_candidate["recovery"]["evidence"]["positionTolerance"],
            },
            "scale0_5": {
                "move": zoomed_review_move,
                "status": zoomed_review["recovery"]["status"],
                "worldTolerance": zoomed_review["recovery"]["evidence"]["positionTolerance"],
            },
        },
        "presentation": {
            "move": presentation_move,
            "status": presentation["recovery"]["status"],
            "possibleMeanings": presentation["recovery"]["possibleMeanings"],
            "acceptedMeaningChanged": False,
        },
        "contact": {
            "move": contact_move,
            "status": contact["recovery"]["status"],
            "observedMeaning": contact["recovery"]["observedMeaning"],
            "possibleMeanings": contact["recovery"]["possibleMeanings"],
            "candidateMeanings": contact["recovery"]["candidateMeanings"],
            "acceptedMeaningChanged": False,
        },
        "microOverlap": {
            "move": micro_move,
            "status": micro["recovery"]["status"],
            "observedMeaning": micro["recovery"]["observedMeaning"],
            "possibleMeanings": micro["recovery"]["possibleMeanings"],
            "acceptedMeaningChanged": False,
        },
        "stableOverlap": {
            "move": candidate_move,
            "status": candidate["recovery"]["status"],
            "possibleMeanings": candidate["recovery"]["possibleMeanings"],
            "operations": candidate["recovery"]["operations"],
            "rawBoundsUnchanged": candidate["rawBounds"] == initial_raw_bounds,
        },
        "reject": {
            "sameHead": after_reject["head"] == initial_head,
            "sameStateHash": after_reject["stateHash"] == initial_state_hash,
            "sameLog": after_reject["log"] == initial_log,
        },
        "acceptAndReplay": {
            "move": accepted_move,
            "head": accepted_state["head"],
            "stateHash": accepted_state["stateHash"],
            "sameLog": replay_state["log"] == accepted_state["log"],
            "sameRawBounds": replay_state["rawBounds"] == accepted_state["rawBounds"],
            "topology": replay_state["topology"],
        },
        "screenshots": [
            "meaning-recovery-presentation.png",
            "meaning-recovery-contact-review.png",
            "meaning-recovery-micro-overlap-review.png",
            "meaning-recovery-candidate.png",
            "meaning-recovery-replayed.png",
        ],
    }
    (OUTPUT / "meaning-recovery-browser.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
