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
                page.on("pageerror", lambda error: errors.append(str(error)))
                install_test_crypto(page)
                page.set_content(html, wait_until="load")
                page.wait_for_function("globalThis.semanticMapSite?.ready === true", timeout=30_000)
                rendered = page.evaluate(
                    """() => ({
                      pattern: semanticMapRuntime.view.pattern,
                      scene: semanticMapSite.editor.snapshot().scene.pattern,
                      svg: Boolean(document.querySelector('#graph-container svg')),
                      editorReady: Boolean(semanticMapSite.editor?.ready),
                    })"""
                )
                assert rendered == {"pattern": pattern, "scene": pattern, "svg": True, "editorReady": True}
                patterns.append(pattern)

                if pattern == "seq/1":
                    page.set_viewport_size({"width": 1024, "height": 768})
                    page.wait_for_function("globalThis.semanticMapReview?.ready === true", timeout=30_000)
                    seq_ux = page.evaluate(
                        """async () => {
                          const nextFrames=()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                          await nextFrames();
                          const adapter=semanticMapApp.adapter;
                          const projector=semanticMapApp.projector;
                          const container=document.getElementById('graph-container');
                          const geometry=(id)=>{
                            const cell=adapter.cellsByRegionId.get(id);
                            const geo=cell?.geometry;
                            return geo ? {x:geo.x,y:geo.y,width:geo.width,height:geo.height} : null;
                          };
                          const initial={
                            view:semanticMapRuntime.view,
                            laneIds:['human','agent'].filter((id)=>adapter.cellsByRegionId.has(id)),
                            relationCount:adapter.lastScene.relations.length,
                            humanLane:geometry('@root/guide/lane-bg-human'),
                            agentLane:geometry('@root/guide/lane-bg-agent'),
                            human:geometry('human'),
                            agent:geometry('agent'),
                            request:geometry('request'),
                            review:geometry('review'),
                            accept:geometry('accept'),
                            proposal:geometry('proposal'),
                            revise:geometry('revise'),
                            append:geometry('append'),
                          };

                          adapter.setCamera(1,5,-3);
                          await nextFrames();
                          const rect=container.getBoundingClientRect();
                          const clientX=Math.round(rect.left+container.clientWidth*0.68);
                          const clientY=Math.round(rect.top+container.clientHeight*0.42);
                          const beforeWheel=adapter.camera();
                          const anchorBefore={
                            x:(clientX-rect.left)/beforeWheel.scale-beforeWheel.translateX,
                            y:(clientY-rect.top)/beforeWheel.scale-beforeWheel.translateY,
                          };
                          const wheel=new WheelEvent('wheel',{
                            bubbles:true,cancelable:true,deltaMode:0,deltaY:-100,clientX,clientY,
                          });
                          const dispatchResult=container.dispatchEvent(wheel);
                          await nextFrames();
                          const afterWheel=adapter.camera();
                          const anchorAfter={
                            x:(clientX-rect.left)/afterWheel.scale-afterWheel.translateX,
                            y:(clientY-rect.top)/afterWheel.scale-afterWheel.translateY,
                          };

                          semanticMapApp.reset();
                          await nextFrames();
                          const fitCamera=adapter.camera();
                          for(let index=0;index<20;index+=1){
                            container.dispatchEvent(new WheelEvent('wheel',{
                              bubbles:true,cancelable:true,deltaMode:0,deltaY:-10_000,clientX,clientY,
                            }));
                          }
                          await nextFrames();
                          const maximumCamera=adapter.camera();
                          for(let index=0;index<24;index+=1){
                            container.dispatchEvent(new WheelEvent('wheel',{
                              bubbles:true,cancelable:true,deltaMode:0,deltaY:10_000,clientX,clientY,
                            }));
                          }
                          await nextFrames();
                          const minimumCamera=adapter.camera();

                          adapter.setCamera(1,0,0);
                          await nextFrames();
                          const original={
                            setCamera:adapter.setCamera.bind(adapter),
                            previewCamera:adapter.previewCamera.bind(adapter),
                            project:projector.project.bind(projector),
                            render:adapter.render.bind(adapter),
                          };
                          const counts={setCamera:0,previewCamera:0,project:0,render:0};
                          adapter.setCamera=(...args)=>{counts.setCamera+=1;return original.setCamera(...args);};
                          adapter.previewCamera=(...args)=>{counts.previewCamera+=1;return original.previewCamera(...args);};
                          projector.project=(...args)=>{counts.project+=1;return original.project(...args);};
                          adapter.render=(...args)=>{counts.render+=1;return original.render(...args);};
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
                          const pinchDuring={counts:{...counts},touch:semanticMapApp.snapshot().touch};
                          fire('pointerup',2,356,300);
                          fire('pointerup',1,86,300);
                          await nextFrames();
                          const pinchAfter={counts:{...counts},touch:semanticMapApp.snapshot().touch,camera:adapter.camera()};
                          adapter.setCamera=original.setCamera;
                          adapter.previewCamera=original.previewCamera;
                          projector.project=original.project;
                          adapter.render=original.render;

                          adapter.setCamera(1.6,-120,-80);
                          adapter.selectRegion('review');
                          await nextFrames();
                          const beforeAppend={
                            camera:adapter.camera(),
                            selection:adapter.selectionSnapshot(),
                            head:semanticMapRuntime.head,
                            stateHash:semanticMapRuntime.stateHash,
                          };
                          semanticMapApp.operation({
                            type:'PlaceTemporalRegions',
                            axis:'ordinal',
                            items:[{regionId:'accept',actor:'human',start:3,end:3}],
                          });
                          await semanticMapReview.openDraft();
                          const accepted=await semanticMapReview.acceptPending();
                          await nextFrames();
                          const afterAppend={
                            camera:adapter.camera(),
                            selection:adapter.selectionSnapshot(),
                            head:semanticMapRuntime.head,
                            stateHash:semanticMapRuntime.stateHash,
                            acceptTemporal:structuredClone(semanticMapApp.store.domain.regions.get('accept').temporal),
                            humanLane:geometry('@root/guide/lane-bg-human'),
                            accept:geometry('accept'),
                            review:geometry('review'),
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
                            pinch:{during:pinchDuring,after:pinchAfter},
                            append:{before:beforeAppend,after:afterAppend,accepted},
                            zoomButtons:document.querySelectorAll('#zoom-in-button,#zoom-out-button').length,
                          };
                        }"""
                    )
                    assert seq_ux["initial"]["view"] == {"pattern": "seq/1", "seq": {"axis": "ordinal", "groupBy": "actor"}}
                    assert seq_ux["initial"]["laneIds"] == ["human", "agent"]
                    assert seq_ux["initial"]["relationCount"] == 7
                    assert seq_ux["initial"]["humanLane"]["height"] == 162
                    assert seq_ux["initial"]["agentLane"]["height"] == 162
                    assert seq_ux["initial"]["human"]["height"] == 60 and seq_ux["initial"]["agent"]["height"] == 60
                    assert seq_ux["initial"]["request"]["y"] == seq_ux["initial"]["review"]["y"]
                    assert seq_ux["initial"]["review"]["y"] != seq_ux["initial"]["accept"]["y"]
                    assert seq_ux["initial"]["proposal"]["y"] != seq_ux["initial"]["revise"]["y"]
                    assert seq_ux["initial"]["proposal"]["y"] == seq_ux["initial"]["append"]["y"]
                    assert seq_ux["wheel"]["prevented"] is True
                    assert abs(seq_ux["wheel"]["factor"] - 1.35) < 1e-9
                    assert abs(seq_ux["wheel"]["anchorBefore"]["x"] - seq_ux["wheel"]["anchorAfter"]["x"]) < 1e-9
                    assert abs(seq_ux["wheel"]["anchorBefore"]["y"] - seq_ux["wheel"]["anchorAfter"]["y"]) < 1e-9
                    assert abs(seq_ux["bounds"]["maximum"] - seq_ux["bounds"]["expectedMaximum"]) < 1e-9
                    assert abs(seq_ux["bounds"]["minimum"] - seq_ux["bounds"]["expectedMinimum"]) < 1e-9
                    assert seq_ux["pinch"]["during"]["touch"]["mode"] == "pinch"
                    assert seq_ux["pinch"]["during"]["touch"]["preview"]["active"] is True
                    assert seq_ux["pinch"]["during"]["counts"]["project"] == 0
                    assert seq_ux["pinch"]["during"]["counts"]["render"] == 0
                    assert seq_ux["pinch"]["after"]["touch"] == {"enabled": True, "mode": "idle", "pointers": 0, "intercepted": 0, "preview": {"active": False, "camera": None}}
                    assert seq_ux["pinch"]["after"]["counts"]["setCamera"] == 1
                    assert seq_ux["pinch"]["after"]["counts"]["project"] == 1
                    assert seq_ux["pinch"]["after"]["counts"]["render"] == 1
                    assert seq_ux["append"]["before"]["selection"] == {"regionIds": ["review"], "relationIds": []}
                    assert seq_ux["append"]["before"]["camera"] == seq_ux["append"]["after"]["camera"]
                    assert seq_ux["append"]["before"]["selection"] == seq_ux["append"]["after"]["selection"]
                    assert seq_ux["append"]["after"]["head"] == seq_ux["append"]["accepted"]["decisionId"]
                    assert seq_ux["append"]["after"]["head"] != seq_ux["append"]["before"]["head"]
                    assert seq_ux["append"]["after"]["stateHash"] != seq_ux["append"]["before"]["stateHash"]
                    assert seq_ux["append"]["after"]["acceptTemporal"]["ordinal"] == {"start": 3, "end": 3}
                    assert seq_ux["append"]["after"]["humanLane"]["height"] == 92
                    assert seq_ux["append"]["after"]["accept"]["y"] == seq_ux["append"]["after"]["review"]["y"]
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
                page.close()
            context.close()
            browser.close()

    assert errors == [], f"browser page errors: {errors}"
    print(json.dumps({
        "schema": "semantic-map-migrated-browser-proof/1",
        "status": "PASS",
        "patterns": patterns,
        "authoring": True,
        "handoff": True,
        "source": True,
        "review": True,
        "maxGraphSvg": True,
        "seqUx": {
            "lanes": seq_ux["initial"]["laneIds"] if seq_ux else [],
            "relations": seq_ux["initial"]["relationCount"] if seq_ux else 0,
            "wheelFactor": seq_ux["wheel"]["factor"] if seq_ux else None,
            "pinchCommitted": bool(seq_ux and seq_ux["pinch"]["after"]["counts"]["setCamera"] == 1),
            "appendCameraPreserved": bool(seq_ux and seq_ux["append"]["before"]["camera"] == seq_ux["append"]["after"]["camera"]),
            "appendSelectionPreserved": bool(seq_ux and seq_ux["append"]["before"]["selection"] == seq_ux["append"]["after"]["selection"]),
        },
        "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
