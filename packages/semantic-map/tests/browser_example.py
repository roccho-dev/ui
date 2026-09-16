from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "packages" / "semantic-map"
FIXTURES = ROOT / "apps" / "artifact-shell" / "capabilities" / "render-semantic-map" / "fixtures"


def install_test_crypto(page) -> None:
    page.expose_function("__semanticTestSha256", lambda values: list(hashlib.sha256(bytes(values)).digest()))
    page.evaluate(
        """() => {
          let uuidSequence = 0;
          Object.defineProperty(crypto, 'subtle', {
            configurable: true,
            value: { digest: async (_algorithm, input) => Uint8Array.from(
              await __semanticTestSha256([...new Uint8Array(input)])
            ).buffer },
          });
          Object.defineProperty(crypto, 'randomUUID', {
            configurable: true,
            value: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
          });
        }"""
    )


def build_html(envelope: dict[str, object], directory: Path) -> str:
    directory.mkdir(parents=True, exist_ok=True)
    input_path = directory / "envelope.json"
    output = directory / "dist"
    input_path.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
    completed = subprocess.run(
        [
            "node",
            str(PACKAGE / "scripts" / "build-browser-example.mjs"),
            f"--input={input_path}",
            f"--out={output}",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout
    return (output / "index.html").read_text(encoding="utf-8")


def fixture_envelope(name: str) -> dict[str, object]:
    fixture = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return fixture["request"]["inputs"][0]["source"]["value"]


def main() -> None:
    errors: list[str] = []
    executable = os.environ.get("CHROMIUM_EXECUTABLE", "/usr/bin/chromium")
    patterns: list[str] = []
    seq_ux: dict[str, object] | None = None
    with tempfile.TemporaryDirectory(prefix="semantic-map-browser-") as temporary_name:
        temporary = Path(temporary_name)
        html_by_pattern = {
            pattern: build_html(fixture_envelope(file), temporary / pattern.replace("/", "-"))
            for pattern, file in (
                ("graph/1", "graph.pass.json"),
                ("map/1", "map.pass.json"),
                ("seq/1", "seq.pass.json"),
                ("chart/1", "chart.pass.json"),
            )
        }
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
            for pattern, html in html_by_pattern.items():
                page = context.new_page()
                page_errors: list[str] = []
                page.on("pageerror", lambda error: (errors.append(str(error)), page_errors.append(str(error))))
                install_test_crypto(page)
                page.set_content(html, wait_until="load")
                try:
                    page.wait_for_function("globalThis.semanticMapSite?.ready === true", timeout=30_000)
                except Exception as error:
                    raise AssertionError(f"semantic-map startup failed for {pattern}: {page_errors}") from error
                rendered = page.evaluate(
                    """() => ({
                      pattern: semanticMapRuntime.view.pattern,
                      scene: semanticMapSite.editor.snapshot().scene.pattern,
                      svg: Boolean(document.querySelector('#graph-container svg')),
                      editorReady: Boolean(semanticMapSite.editor?.ready),
                      rawInternalsAbsent: semanticMapSite.editor.adapter === undefined
                        && semanticMapSite.editor.projector === undefined
                        && semanticMapSite.editor.store === undefined,
                      coreMethods: Object.keys(semanticMapSite.editor.core).sort(),
                    })"""
                )
                assert rendered == {
                    "pattern": pattern,
                    "scene": pattern,
                    "svg": True,
                    "editorReady": True,
                    "rawInternalsAbsent": True,
                    "coreMethods": ["acceptGesture", "destroy", "dispatch", "replaceInput", "snapshot", "subscribe"],
                }
                patterns.append(pattern)

                if pattern == "seq/1":
                    page.set_viewport_size({"width": 1024, "height": 768})
                    page.wait_for_function("globalThis.semanticMapReview?.ready === true", timeout=30_000)
                    seq_ux = page.evaluate(
                        """async () => {
                          const nextFrames=()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                          await nextFrames();
                          const app=semanticMapApp;
                          const container=document.getElementById('graph-container');
                          const initialScene=app.currentScene();
                          const initial={
                            view:structuredClone(semanticMapRuntime.view),
                            relationCount:initialScene.relations.length,
                            regions:initialScene.representations.map((item)=>item.regionId),
                            sceneIds:initialScene.scenes.map((item)=>item.id),
                          };

                          app.reset();
                          await nextFrames();
                          const rect=container.getBoundingClientRect();
                          const clientX=Math.round(rect.left+container.clientWidth*0.68);
                          const clientY=Math.round(rect.top+container.clientHeight*0.42);
                          const beforeWheel=structuredClone(app.snapshot().camera);
                          const anchorBefore={
                            x:(clientX-rect.left)/beforeWheel.scale-beforeWheel.translateX,
                            y:(clientY-rect.top)/beforeWheel.scale-beforeWheel.translateY,
                          };
                          const wheel=new WheelEvent('wheel',{
                            bubbles:true,cancelable:true,deltaMode:0,deltaY:-100,clientX,clientY,
                          });
                          const dispatchResult=container.dispatchEvent(wheel);
                          await nextFrames();
                          const afterWheel=structuredClone(app.snapshot().camera);
                          const anchorAfter={
                            x:(clientX-rect.left)/afterWheel.scale-afterWheel.translateX,
                            y:(clientY-rect.top)/afterWheel.scale-beforeWheel.translateY,
                          };

                          app.reset();
                          await nextFrames();
                          const fitCamera=structuredClone(app.snapshot().camera);
                          for(let index=0;index<20;index+=1){
                            container.dispatchEvent(new WheelEvent('wheel',{
                              bubbles:true,cancelable:true,deltaMode:0,deltaY:-10_000,clientX,clientY,
                            }));
                          }
                          await nextFrames();
                          const maximumCamera=structuredClone(app.snapshot().camera);
                          for(let index=0;index<24;index+=1){
                            container.dispatchEvent(new WheelEvent('wheel',{
                              bubbles:true,cancelable:true,deltaMode:0,deltaY:10_000,clientX,clientY,
                            }));
                          }
                          await nextFrames();
                          const minimumCamera=structuredClone(app.snapshot().camera);

                          app.reset();
                          await nextFrames();
                          const beforePinch=structuredClone(app.snapshot().camera);
                          const fire=(type,id,x,y)=>container.dispatchEvent(new PointerEvent(type,{
                            bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',
                            clientX:x,clientY:y,isPrimary:id===1,buttons:type==='pointerup'?0:1,
                          }));
                          fire('pointerdown',1,100,300);
                          fire('pointerdown',2,300,300);
                          for(let index=0;index<8;index+=1){
                            fire('pointermove',1,100-index*2,300);
                            fire('pointermove',2,300+index*8,300);
                            await new Promise((resolve)=>requestAnimationFrame(resolve));
                          }
                          const pinchDuring=structuredClone(app.snapshot().touch);
                          fire('pointerup',2,356,300);
                          fire('pointerup',1,86,300);
                          await nextFrames();
                          const pinchAfter={touch:structuredClone(app.snapshot().touch),camera:structuredClone(app.snapshot().camera)};

                          app.focusRegion('review',1.6);
                          app.core.dispatch({type:'selection.set',selection:{regionIds:['review'],relationIds:[]}});
                          await nextFrames();
                          const beforeAppend={
                            camera:structuredClone(app.snapshot().camera),
                            selection:structuredClone(app.core.snapshot().selection),
                            head:semanticMapRuntime.head,
                            stateHash:semanticMapRuntime.stateHash,
                            scene:structuredClone(app.snapshot().scene),
                          };
                          app.operation({
                            type:'PlaceTemporalRegions',
                            axis:'ordinal',
                            items:[{regionId:'accept',actor:'human',start:3,end:3}],
                          });
                          await semanticMapReview.openDraft({
                            reason:'Move Accept into the reviewed ordinal position.',
                            sourceRefs:['https://github.com/roccho-dev/ui/issues/197','sha256:browser-proof'],
                            assessment:'Proposal only; no current or authority mutation before Accept.',
                          });
                          const pendingReview=semanticMapReview.pending();
                          const review={
                            model:structuredClone(pendingReview.model),
                            overlay:app.reviewOverlaySnapshot(),
                            dom:{
                              baseLabel:document.getElementById('review-base-label').textContent,
                              baseCurrent:document.getElementById('review-base-label').dataset.current,
                              reason:document.getElementById('review-reason').textContent,
                              sourceRefs:[...document.querySelectorAll('#review-source-refs li')].map((item)=>item.textContent),
                              overlayGroups:document.querySelectorAll('[data-layer=semantic-review]').length,
                              overlayRegions:document.querySelectorAll('[data-layer=semantic-review] [data-review-kind=region]').length,
                              overlayPointerEvents:getComputedStyle(document.querySelector('[data-layer=semantic-review]')).pointerEvents,
                            },
                          };
                          const accepted=await semanticMapReview.acceptPending();
                          await nextFrames();
                          const snapshot=app.snapshot();
                          const afterAppend={
                            camera:structuredClone(snapshot.camera),
                            selection:structuredClone(app.core.snapshot().selection),
                            head:semanticMapRuntime.head,
                            stateHash:semanticMapRuntime.stateHash,
                            acceptTemporal:structuredClone(snapshot.domain.regions.find((item)=>item.id==='accept').temporal),
                            reviewOverlay:app.reviewOverlaySnapshot(),
                            scene:structuredClone(snapshot.scene),
                          };
                          return {
                            initial,
                            wheel:{
                              prevented:wheel.defaultPrevented && dispatchResult===false,
                              before:beforeWheel,after:afterWheel,
                              factor:afterWheel.scale/beforeWheel.scale,
                              anchorBefore,anchorAfter,
                            },
                            bounds:{
                              fit:fitCamera.scale,maximum:maximumCamera.scale,minimum:minimumCamera.scale,
                              expectedMaximum:5.2,expectedMinimum:Math.min(0.42,fitCamera.scale),
                            },
                            pinch:{before:beforePinch,during:pinchDuring,after:pinchAfter},
                            review,
                            append:{before:beforeAppend,after:afterAppend,accepted},
                            zoomButtons:document.querySelectorAll('#zoom-in-button,#zoom-out-button').length,
                          };
                        }"""
                    )
                    assert seq_ux["initial"]["view"] == {"pattern": "seq/1", "seq": {"axis": "ordinal", "groupBy": "actor"}}
                    assert seq_ux["initial"]["relationCount"] == 7
                    assert {"human", "agent", "request", "review", "accept", "proposal", "revise", "append"}.issubset(set(seq_ux["initial"]["regions"]))
                    assert seq_ux["wheel"]["prevented"] is True
                    assert abs(seq_ux["wheel"]["factor"] - 1.35) < 1e-9
                    assert abs(seq_ux["wheel"]["anchorBefore"]["x"] - seq_ux["wheel"]["anchorAfter"]["x"]) < 1e-9
                    assert abs(seq_ux["wheel"]["anchorBefore"]["y"] - seq_ux["wheel"]["anchorAfter"]["y"]) < 1e-9
                    assert abs(seq_ux["bounds"]["maximum"] - seq_ux["bounds"]["expectedMaximum"]) < 1e-9
                    assert abs(seq_ux["bounds"]["minimum"] - seq_ux["bounds"]["expectedMinimum"]) < 1e-9
                    assert seq_ux["pinch"]["during"]["mode"] == "pinch"
                    assert seq_ux["pinch"]["during"]["preview"]["active"] is True
                    assert seq_ux["pinch"]["after"]["touch"] == {"enabled": True, "mode": "idle", "pointers": 0, "intercepted": 0, "preview": {"active": False, "camera": None}}
                    assert seq_ux["pinch"]["after"]["camera"] != seq_ux["pinch"]["before"]
                    assert seq_ux["review"]["model"]["schema"] == "semantic-map-review-model/1"
                    assert seq_ux["review"]["model"]["authority"] is False
                    assert seq_ux["review"]["model"]["status"] == "proposal"
                    assert seq_ux["review"]["model"]["baseLabel"] == "base"
                    assert seq_ux["review"]["model"]["trace"][0]["type"] == "PlaceTemporalRegions"
                    assert seq_ux["review"]["model"]["delta"]["regions"][0]["id"] == "accept"
                    assert seq_ux["review"]["model"]["delta"]["regions"][0]["status"] == "changed"
                    assert seq_ux["review"]["overlay"]["active"] is True
                    assert seq_ux["review"]["overlay"]["overlay"]["authority"] is False
                    assert seq_ux["review"]["dom"]["baseLabel"] == "Base"
                    assert seq_ux["review"]["dom"]["baseCurrent"] == "false"
                    assert seq_ux["review"]["dom"]["reason"] == "Move Accept into the reviewed ordinal position."
                    assert seq_ux["review"]["dom"]["sourceRefs"] == [
                        "https://github.com/roccho-dev/ui/issues/197", "sha256:browser-proof"
                    ]
                    assert seq_ux["review"]["dom"]["overlayGroups"] == 1
                    assert seq_ux["review"]["dom"]["overlayRegions"] >= 1
                    assert seq_ux["review"]["dom"]["overlayPointerEvents"] == "none"
                    assert seq_ux["append"]["after"]["reviewOverlay"]["active"] is False
                    assert seq_ux["append"]["before"]["selection"] == {"regionIds": ["review"], "relationIds": []}
                    assert seq_ux["append"]["before"]["camera"] == seq_ux["append"]["after"]["camera"]
                    assert seq_ux["append"]["before"]["selection"] == seq_ux["append"]["after"]["selection"]
                    assert seq_ux["append"]["after"]["head"] == seq_ux["append"]["accepted"]["decisionId"]
                    assert seq_ux["append"]["after"]["head"] != seq_ux["append"]["before"]["head"]
                    assert seq_ux["append"]["after"]["stateHash"] != seq_ux["append"]["before"]["stateHash"]
                    assert seq_ux["append"]["after"]["acceptTemporal"]["ordinal"] == {"start": 3, "end": 3}
                    assert seq_ux["append"]["after"]["scene"]["pattern"] == "seq/1"
                    assert seq_ux["zoomButtons"] == 0

                if pattern == "graph/1":
                    for name in ("semanticMapHandoff", "semanticMapReview", "semanticMapSource"):
                        page.wait_for_function(f"globalThis.{name}?.ready === true", timeout=30_000)
                    controls = page.evaluate(
                        """() => ({
                          pattern: !document.getElementById('pattern-select').disabled,
                          source: !document.getElementById('source-open').disabled,
                          handoff: !document.getElementById('handoff-fab').disabled,
                          undo: !document.getElementById('undo').disabled,
                          redo: !document.getElementById('redo').disabled,
                          embedded: semanticMapArtifactModule.read().embedded,
                        })"""
                    )
                    assert all(controls[key] for key in ("pattern", "source", "handoff", "undo", "redo"))
                    assert controls["embedded"] is False

                    source = page.evaluate(
                        """async () => {
                          await semanticMapSource.open();
                          const state = semanticMapSource.current();
                          document.getElementById('source-format').value = 'log';
                          await semanticMapSource.render('log');
                          const log = semanticMapSource.current();
                          document.getElementById('source-format').value = 'envelope';
                          await semanticMapSource.render('envelope');
                          const envelope = semanticMapSource.current();
                          semanticMapSource.close();
                          return {state, log, envelope};
                        }"""
                    )
                    assert source["state"]["text"] and source["log"]["text"] and source["envelope"]["text"]
                    assert json.loads(source["envelope"]["text"])["schema"] == "semantic-map-envelope/3"

                    handoff = page.evaluate(
                        """async () => {
                          await semanticMapHandoff.open();
                          const transfer = await semanticMapHandoff.buildTextTransfer();
                          semanticMapHandoff.close();
                          return {kind: transfer.kind, text: transfer.clipboardText, url: transfer.stateUrl};
                        }"""
                    )
                    assert handoff["text"] and "#smap=" in handoff["url"]

                    rejected_review = page.evaluate(
                        """async () => {
                          const app=semanticMapApp;
                          const target=app.currentScene().representations.find((item)=>!item.readOnly&&!item.isRoot&&!item.isGuide);
                          const id=target.sourceRegionId ?? target.regionId;
                          const original=app.snapshot().domain.regions.find((item)=>item.id===id).label;
                          const before={head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,label:original};
                          app.operation({type:'RenameRegion',regionId:id,label:`${original} · reject`});
                          await semanticMapReview.openDraft({reason:'Reject overlay cleanup proof'});
                          const open=app.reviewOverlaySnapshot();
                          const rejected=await semanticMapReview.rejectPending();
                          await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                          return {
                            rejected,
                            open,
                            after:{
                              head:semanticMapRuntime.head,
                              stateHash:semanticMapRuntime.stateHash,
                              label:app.snapshot().domain.regions.find((item)=>item.id===id).label,
                              draft:semanticMapRuntime.draftCount(),
                              overlay:app.reviewOverlaySnapshot(),
                              overlayGroups:document.querySelectorAll('[data-layer=semantic-review]').length,
                            },
                            before,
                          };
                        }"""
                    )
                    assert rejected_review["rejected"] is True
                    assert rejected_review["open"]["active"] is True
                    assert rejected_review["after"]["head"] == rejected_review["before"]["head"]
                    assert rejected_review["after"]["stateHash"] == rejected_review["before"]["stateHash"]
                    assert rejected_review["after"]["label"] == rejected_review["before"]["label"]
                    assert rejected_review["after"]["draft"] == 0
                    assert rejected_review["after"]["overlay"]["active"] is False
                    assert rejected_review["after"]["overlayGroups"] == 0
                page.close()
            context.close()
            browser.close()

    assert errors == [], f"browser page errors: {errors}"
    print(json.dumps({
        "schema": "semantic-map-migrated-browser-proof/2",
        "status": "PASS",
        "patterns": patterns,
        "authoring": True,
        "handoff": True,
        "source": True,
        "review": True,
        "maxGraphSvg": True,
        "publicEditorBoundary": True,
        "seqUx": {
            "relations": seq_ux["initial"]["relationCount"] if seq_ux else 0,
            "wheelFactor": seq_ux["wheel"]["factor"] if seq_ux else None,
            "pinchCommitted": bool(seq_ux and seq_ux["pinch"]["after"]["camera"] != seq_ux["pinch"]["before"]),
            "appendCameraPreserved": bool(seq_ux and seq_ux["append"]["before"]["camera"] == seq_ux["append"]["after"]["camera"]),
            "appendSelectionPreserved": bool(seq_ux and seq_ux["append"]["before"]["selection"] == seq_ux["append"]["after"]["selection"]),
        },
        "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
