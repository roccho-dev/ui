from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from browser_e2e_support import load_app

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(os.environ.get("SEMANTIC_MAP_PROOF_OUTPUT", "/tmp/semantic-map-proof"))


def overlay_state(page):
    return page.evaluate(
        """() => {
          const snapshot=semanticMapApp.snapshot();
          const sets=Object.fromEntries(snapshot.scene.setOverlay.sets.map((item)=>[item.regionId,item.bounds]));
          const a=sets.a, b=sets.b;
          const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
            * Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
          return {
            topology:snapshot.scene.setOverlay.pairs[0]?.topology ?? null,
            overlapArea:overlap,
            sets,
            rawBounds:Object.fromEntries(snapshot.domain.regions.filter((item)=>item.kind==='set').map((item)=>[item.id,item.bounds])),
            relations:snapshot.domain.relations,
            draft:semanticMapRuntime.draftOperations(),
            head:semanticMapRuntime.head,
            stateHash:semanticMapRuntime.stateHash,
            log:semanticMapRuntime.log,
            state:semanticMapApp.exportJSONL(),
            proof:semanticMapSite.setTopologyProof,
          };
        }"""
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

        before = overlay_state(page)
        assert before["proof"] is True
        assert before["topology"] == "disjoint"
        assert before["overlapArea"] == 0
        assert before["draft"] == []
        assert [relation["kind"] for relation in before["relations"]] == ["disjointWith"]
        page.screenshot(path=str(OUTPUT / "set-topology-before.png"), full_page=True)

        moved = page.evaluate(
            """async () => {
              const snapshot=semanticMapApp.snapshot();
              const sets=Object.fromEntries(snapshot.scene.setOverlay.sets.map((item)=>[item.regionId,item.bounds]));
              const a=sets.a, b=sets.b;
              const dx=(a.x+a.width*0.55)-b.x;
              const dy=20;
              const cell=semanticMapApp.adapter.cellsByRegionId.get('b');
              semanticMapApp.adapter.graph.moveCells([cell],dx,dy);
              await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              return {dx,dy};
            }"""
        )
        page.wait_for_function("semanticMapRuntime.draftCount() === 2")
        page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")
        after = overlay_state(page)
        assert after["topology"] == "partial-overlap"
        assert after["overlapArea"] > 0
        assert [operation["type"] for operation in after["draft"]] == ["RemoveSelection", "ConnectRegions"]
        assert all(operation["type"] != "MoveRegions" for operation in after["draft"])
        assert after["draft"][1]["kind"] == "overlapsWith"
        assert [relation["kind"] for relation in after["relations"]] == ["overlapsWith"]
        assert after["rawBounds"]["b"]["x"] == 520, "drag coordinates must not become semantic authority"
        page.screenshot(path=str(OUTPUT / "set-topology-after-draft.png"), full_page=True)

        accepted = page.evaluate(
            """async () => {
              const proposal=await semanticMapRuntime.createDraftProposal();
              const accepted=await semanticMapRuntime.accept(proposal);
              await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const decision=JSON.parse(accepted.log.trimEnd().split('\\n').at(-1));
              return {proposal,accepted:{decisionId:accepted.decisionId,stateHash:accepted.stateHash,log:accepted.log,url:accepted.url},decision};
            }"""
        )
        page.wait_for_function("semanticMapRuntime.draftCount() === 0")
        accepted_state = overlay_state(page)
        assert [operation["type"] for operation in accepted["decision"]["operations"]] == ["RemoveSelection", "ConnectRegions"]
        assert all(operation["type"] != "MoveRegions" for operation in accepted["decision"]["operations"])
        assert accepted_state["topology"] == "partial-overlap"
        assert accepted_state["overlapArea"] > 0
        assert accepted_state["head"] == accepted["accepted"]["decisionId"]
        assert accepted_state["stateHash"] == accepted["accepted"]["stateHash"]

        fragment = "#" + urlsplit(accepted["accepted"]["url"]).fragment
        recompiled_page = load_app(context, ROOT / "examples" / "render.semantic-map.set-topology" / "dist" / "index.html", errors, fragment=fragment)
        recompiled_page.wait_for_function("semanticMapSite.setTopologyProof === true")
        recompiled_page.wait_for_function("semanticMapApp.snapshot().scene.setOverlay.pairs[0]?.topology === 'partial-overlap'")
        recompiled = overlay_state(recompiled_page)
        assert recompiled["draft"] == []
        assert recompiled["topology"] == "partial-overlap"
        assert recompiled["overlapArea"] > 0
        assert recompiled["head"] == accepted_state["head"]
        assert recompiled["stateHash"] == accepted_state["stateHash"]
        assert recompiled["log"] == accepted_state["log"]
        assert recompiled["rawBounds"] == accepted_state["rawBounds"]
        page.screenshot(path=str(OUTPUT / "set-topology-accepted.png"), full_page=True)
        recompiled_page.screenshot(path=str(OUTPUT / "set-topology-recompiled.png"), full_page=True)

        browser.close()

    assert not errors, errors
    decision_line = accepted["accepted"]["log"].strip().splitlines()[-1] + "\n"
    (OUTPUT / "meaning-decision.jsonl").write_text(decision_line, encoding="utf-8")
    (OUTPUT / "initial-state.jsonl").write_text(before["state"], encoding="utf-8")
    (OUTPUT / "reduced-state.jsonl").write_text(recompiled["state"], encoding="utf-8")
    (OUTPUT / "accepted-decision-log.jsonl").write_text(recompiled["log"], encoding="utf-8")
    result = {
        "schema": "semantic-map-set-topology-roundtrip-browser-e2e/1",
        "pass": True,
        "status": "PASS",
        "skipped": False,
        "complete": True,
        "errors": [],
        "maxGraphMove": moved,
        "before": {
            "topology": before["topology"],
            "overlapArea": before["overlapArea"],
            "relations": before["relations"],
        },
        "draft": {
            "topology": after["topology"],
            "overlapArea": after["overlapArea"],
            "operations": after["draft"],
            "rawBounds": after["rawBounds"],
        },
        "decision": accepted["decision"],
        "accepted": {
            "head": accepted_state["head"],
            "stateHash": accepted_state["stateHash"],
            "topology": accepted_state["topology"],
            "overlapArea": accepted_state["overlapArea"],
        },
        "recompiled": {
            "head": recompiled["head"],
            "stateHash": recompiled["stateHash"],
            "topology": recompiled["topology"],
            "overlapArea": recompiled["overlapArea"],
            "sameLog": recompiled["log"] == accepted_state["log"],
            "sameRawBounds": recompiled["rawBounds"] == accepted_state["rawBounds"],
        },
        "artifacts": [
            "meaning-decision.jsonl",
            "initial-state.jsonl",
            "reduced-state.jsonl",
            "accepted-decision-log.jsonl",
        ],
        "screenshots": [
            "set-topology-before.png",
            "set-topology-after-draft.png",
            "set-topology-accepted.png",
            "set-topology-recompiled.png",
        ],
    }
    (OUTPUT / "set-topology-roundtrip.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
