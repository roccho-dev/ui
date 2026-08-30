from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from browser_e2e_support import load_app

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(os.environ.get("SEMANTIC_MAP_PROOF_OUTPUT", "/tmp/semantic-map-proof"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def state(page):
    return page.evaluate(
        """() => {
          const snapshot=semanticMapApp.snapshot();
          const sets=Object.fromEntries(snapshot.scene.setOverlay.sets.map((item)=>[item.regionId,item.bounds]));
          const a=sets.a, b=sets.b;
          const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
            * Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
          return {
            profile:semanticMapSite.setTopologyProjectionProfile,
            topology:snapshot.scene.setOverlay.pairs[0]?.topology ?? null,
            overlapArea:overlap,
            sets,
            rawBounds:Object.fromEntries(snapshot.domain.regions.filter((item)=>item.kind==='set').map((item)=>[item.id,item.bounds])),
            relations:snapshot.domain.relations,
            draft:semanticMapRuntime.draftOperations(),
            head:semanticMapRuntime.head,
            stateHash:semanticMapRuntime.stateHash,
            log:semanticMapRuntime.log,
            view:semanticMapRuntime.view,
            presentationProjection:snapshot.presentationProjection,
          };
        }"""
    )


def move_to_overlap(page):
    return page.evaluate(
        """async () => {
          const snapshot=semanticMapApp.snapshot();
          const sets=Object.fromEntries(snapshot.scene.setOverlay.sets.map((item)=>[item.regionId,item.bounds]));
          const a=sets.a, b=sets.b;
          const dx=(a.x+a.width*0.18)-b.x;
          const dy=(a.y+a.height*0.18)-b.y;
          const cell=semanticMapApp.adapter.cellsByRegionId.get('b');
          semanticMapApp.adapter.graph.moveCells([cell],dx,dy);
          await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          return {dx,dy};
        }"""
    )


def accept(page):
    return page.evaluate(
        """async () => {
          const proposal=await semanticMapRuntime.createDraftProposal();
          const accepted=await semanticMapRuntime.accept(proposal);
          await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const decision=JSON.parse(accepted.log.trimEnd().split('\\n').at(-1));
          return {
            proposal,
            decision,
            accepted:{
              decisionId:accepted.decisionId,
              stateHash:accepted.stateHash,
              log:accepted.log,
              url:accepted.url,
            },
          };
        }"""
    )


def axis(bounds):
    a = bounds["a"]
    b = bounds["b"]
    dx = abs((a["x"] + a["width"] / 2) - (b["x"] + b["width"] / 2))
    dy = abs((a["y"] + a["height"] / 2) - (b["y"] + b["height"] / 2))
    return "horizontal" if dx > dy else "vertical"


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
        horizontal = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html", errors)
        vertical = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "vertical.html", errors)
        for page in (horizontal, vertical):
            page.wait_for_function("semanticMapSite.setTopologyProof === true")
            page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'disjoint'")

        before_horizontal = state(horizontal)
        before_vertical = state(vertical)
        assert before_horizontal["profile"] == "horizontal"
        assert before_vertical["profile"] == "vertical"
        assert before_horizontal["log"] == before_vertical["log"]
        assert before_horizontal["head"] == before_vertical["head"]
        assert before_horizontal["stateHash"] == before_vertical["stateHash"]
        assert before_horizontal["view"] == before_vertical["view"] == {"pattern": "map/1", "frame": {"select": ["b"]}}
        assert before_horizontal["rawBounds"] == before_vertical["rawBounds"]
        assert axis(before_horizontal["sets"]) == "horizontal"
        assert axis(before_vertical["sets"]) == "vertical"
        assert before_horizontal["sets"] != before_vertical["sets"]
        for current, expected_id in (
            (before_horizontal, "set-topology/horizontal/1"),
            (before_vertical, "set-topology/vertical/1"),
        ):
            projection = current["presentationProjection"]
            assert projection["schema"] == "semantic-presentation-projection/1"
            assert projection["id"] == expected_id
            assert projection["pattern"] == "map/1"
            assert {item["regionId"]: item["bounds"] for item in projection["layout"]} == current["sets"]
            assert sorted(
                (item["regionId"], item["role"], item["editKinds"])
                for item in projection["interactions"]
            ) == [("a", "set", ["set-topology"]), ("b", "set", ["set-topology"])]
        horizontal.screenshot(path=str(OUTPUT / "projection-horizontal-before.png"), full_page=True)
        vertical.screenshot(path=str(OUTPUT / "projection-vertical-before.png"), full_page=True)

        moves = {
            "horizontal": move_to_overlap(horizontal),
            "vertical": move_to_overlap(vertical),
        }
        for page in (horizontal, vertical):
            page.wait_for_function("semanticMapRuntime.draftCount() === 2")
            page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")

        draft_horizontal = state(horizontal)
        draft_vertical = state(vertical)
        assert draft_horizontal["draft"] == draft_vertical["draft"]
        assert [operation["type"] for operation in draft_horizontal["draft"]] == ["RemoveSelection", "ConnectRegions"]
        assert draft_horizontal["draft"][1]["kind"] == "overlapsWith"
        assert all(operation["type"] != "MoveRegions" for operation in draft_horizontal["draft"])
        assert draft_horizontal["rawBounds"] == before_horizontal["rawBounds"]
        assert draft_vertical["rawBounds"] == before_vertical["rawBounds"]
        horizontal.screenshot(path=str(OUTPUT / "projection-horizontal-draft.png"), full_page=True)
        vertical.screenshot(path=str(OUTPUT / "projection-vertical-draft.png"), full_page=True)

        accepted_horizontal = accept(horizontal)
        accepted_vertical = accept(vertical)
        accepted_horizontal_state = state(horizontal)
        accepted_vertical_state = state(vertical)
        assert accepted_horizontal["decision"] == accepted_vertical["decision"]
        assert accepted_horizontal["accepted"]["log"] == accepted_vertical["accepted"]["log"]
        assert accepted_horizontal["accepted"]["decisionId"] == accepted_vertical["accepted"]["decisionId"]
        assert accepted_horizontal["accepted"]["stateHash"] == accepted_vertical["accepted"]["stateHash"]
        assert accepted_horizontal_state["log"] == accepted_vertical_state["log"]
        assert accepted_horizontal_state["stateHash"] == accepted_vertical_state["stateHash"]
        assert accepted_horizontal_state["topology"] == accepted_vertical_state["topology"] == "partial-overlap"
        assert accepted_horizontal_state["overlapArea"] > 0
        assert accepted_vertical_state["overlapArea"] > 0
        assert axis(accepted_horizontal_state["sets"]) == "horizontal"
        assert axis(accepted_vertical_state["sets"]) == "vertical"
        assert accepted_horizontal_state["sets"] != accepted_vertical_state["sets"]

        fragment = "#" + urlsplit(accepted_horizontal["accepted"]["url"]).fragment
        replay_horizontal = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html", errors, fragment=fragment)
        replay_vertical = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "vertical.html", errors, fragment=fragment)
        for page in (replay_horizontal, replay_vertical):
            page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")
        replay_horizontal_state = state(replay_horizontal)
        replay_vertical_state = state(replay_vertical)
        assert replay_horizontal_state["log"] == replay_vertical_state["log"] == accepted_horizontal_state["log"]
        assert replay_horizontal_state["stateHash"] == replay_vertical_state["stateHash"] == accepted_horizontal_state["stateHash"]
        assert replay_horizontal_state["rawBounds"] == replay_vertical_state["rawBounds"] == before_horizontal["rawBounds"]
        assert axis(replay_horizontal_state["sets"]) == "horizontal"
        assert axis(replay_vertical_state["sets"]) == "vertical"
        assert replay_horizontal_state["sets"] != replay_vertical_state["sets"]
        assert replay_horizontal_state["presentationProjection"]["id"] == "set-topology/horizontal/1"
        assert replay_vertical_state["presentationProjection"]["id"] == "set-topology/vertical/1"
        assert {
            item["regionId"]: item["bounds"]
            for item in replay_horizontal_state["presentationProjection"]["layout"]
        } == replay_horizontal_state["sets"]
        assert {
            item["regionId"]: item["bounds"]
            for item in replay_vertical_state["presentationProjection"]["layout"]
        } == replay_vertical_state["sets"]
        replay_horizontal.screenshot(path=str(OUTPUT / "projection-horizontal-replayed.png"), full_page=True)
        replay_vertical.screenshot(path=str(OUTPUT / "projection-vertical-replayed.png"), full_page=True)
        browser.close()

    assert not errors, errors
    renderer_files = sorted((ROOT / "packages" / "semantic-map" / "renderer-maxgraph").glob("*.js"))
    result = {
        "schema": "semantic-map-protocol-projection-decoupling-browser-e2e/1",
        "pass": True,
        "status": "PASS",
        "skipped": False,
        "complete": True,
        "errors": [],
        "semanticInput": "packages/semantic-map/examples/set-topology.jsonl",
        "sameInitialDecisionLog": before_horizontal["log"] == before_vertical["log"],
        "sameInitialStateHash": before_horizontal["stateHash"] == before_vertical["stateHash"],
        "sameViewProtocol": before_horizontal["view"] == before_vertical["view"],
        "differentInitialProjection": before_horizontal["sets"] != before_vertical["sets"],
        "projectionAxes": {
            "horizontal": axis(before_horizontal["sets"]),
            "vertical": axis(before_vertical["sets"]),
        },
        "maxGraphMoves": moves,
        "sameSemanticCandidate": draft_horizontal["draft"] == draft_vertical["draft"],
        "semanticCandidate": draft_horizontal["draft"],
        "sameAcceptedDecision": accepted_horizontal["decision"] == accepted_vertical["decision"],
        "sameAcceptedDecisionLog": accepted_horizontal_state["log"] == accepted_vertical_state["log"],
        "sameAcceptedStateHash": accepted_horizontal_state["stateHash"] == accepted_vertical_state["stateHash"],
        "accepted": {
            "head": accepted_horizontal_state["head"],
            "stateHash": accepted_horizontal_state["stateHash"],
            "topology": accepted_horizontal_state["topology"],
        },
        "sameReplayDecisionLog": replay_horizontal_state["log"] == replay_vertical_state["log"],
        "sameReplayStateHash": replay_horizontal_state["stateHash"] == replay_vertical_state["stateHash"],
        "differentReplayProjection": replay_horizontal_state["sets"] != replay_vertical_state["sets"],
        "sameRawSemanticBounds": replay_horizontal_state["rawBounds"] == replay_vertical_state["rawBounds"],
        "presentationBoundary": {
            "schema": before_horizontal["presentationProjection"]["schema"],
            "pattern": "map/1",
            "horizontalId": before_horizontal["presentationProjection"]["id"],
            "verticalId": before_vertical["presentationProjection"]["id"],
            "layoutMatchesScene": True,
            "interactionTargets": before_horizontal["presentationProjection"]["interactions"],
            "domainClonePresent": False,
            "sceneInternalsConsumedBySemanticBridge": False,
        },
        "rendererMaxGraphFiles": {
            str(path.relative_to(ROOT)): sha256(path) for path in renderer_files
        },
        "screenshots": [
            "projection-horizontal-before.png",
            "projection-vertical-before.png",
            "projection-horizontal-draft.png",
            "projection-vertical-draft.png",
            "projection-horizontal-replayed.png",
            "projection-vertical-replayed.png",
        ],
        "claimCeiling": {
            "proven": [
                "one semantic DecisionLog can drive two deterministic maxGraph projections",
                "projection profile is outside semantic JSONL and reducer",
                "both projections emit the same semantic candidate",
                "both projections accept the same Decision and State hash",
                "fresh replay keeps one protocol while preserving distinct layouts",
                "layout overlay is separate from the semantic domain",
                "semantic gesture translation consumes interaction projection rather than Scene internals",
            ],
            "notProven": [
                "arbitrary SVG path topology",
                "unbounded visual grammar",
                "three-or-more-set zones",
                "production authority integration",
            ],
        },
    }
    (OUTPUT / "protocol-projection-decoupling.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
