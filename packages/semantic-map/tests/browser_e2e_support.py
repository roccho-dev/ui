from __future__ import annotations

import base64
import gzip
import hashlib
import json
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[3]


def install_test_crypto(page: Page) -> None:
    page.expose_function(
        "__semanticTestSha256",
        lambda values: list(hashlib.sha256(bytes(values)).digest()),
    )
    page.evaluate(
        """() => {
          let uuidSequence = 0;
          Object.defineProperty(crypto, 'subtle', {
            configurable: true,
            value: {
              digest: async (_algorithm, input) => Uint8Array.from(
                await __semanticTestSha256([...new Uint8Array(input)])
              ).buffer,
            },
          });
          Object.defineProperty(crypto, 'randomUUID', {
            configurable: true,
            value: () => {
              uuidSequence += 1;
              return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, '0')}`;
            },
          });
        }"""
    )


def load_app(
    context: BrowserContext,
    html_path: Path,
    errors: list[str],
    *,
    fragment: str = "",
    url: str = "",
    viewport: dict[str, int] | None = None,
    expect_ready: bool = True,
) -> Page:
    assert not (fragment and url), "fragment and url are mutually exclusive"
    page = context.new_page()
    if viewport:
        page.set_viewport_size(viewport)
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_test_crypto(page)
    if url:
        page.evaluate("value => history.replaceState(null, '', value)", url)
    elif fragment:
        page.evaluate("value => history.replaceState(null, '', value)", fragment)
    page.set_content(html_path.read_text(encoding="utf-8"), wait_until="load")
    if expect_ready:
        page.wait_for_function("globalThis.semanticMapSite?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapApp?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapRuntime?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapReview?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapHandoff?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapSource?.ready === true", timeout=30_000)
    else:
        page.wait_for_function("globalThis.semanticMapSite?.ready === false", timeout=30_000)
    return page


def raw_token(value: dict[str, object]) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    compressed = gzip.compress(payload, mtime=0)
    return base64.urlsafe_b64encode(compressed).decode().rstrip("=")


def boxes(page: Page, ids: list[str]) -> dict[str, object]:
    return page.evaluate(
        """ids => {
          const values = Object.fromEntries(ids.map((id) => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return [id, {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height}];
          }));
          const overlaps=[];
          for (let i=0;i<ids.length;i+=1) for (let j=i+1;j<ids.length;j+=1) {
            const a=values[ids[i]], b=values[ids[j]];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push([ids[i],ids[j]]);
          }
          return {
            values,
            overlaps,
            withinViewport:Object.values(values).every((rect) => rect.width>0 && rect.height>0 && rect.left>=0 && rect.top>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight),
          };
        }""",
        ids,
    )


def main() -> None:
    errors: list[str] = []
    requests: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            device_scale_factor=1,
        )
        context.on("request", lambda request: requests.append(request.url))

        root = context.new_page()
        root.set_content((DIST / "index.html").read_text(encoding="utf-8"), wait_until="load")
        root_state = root.evaluate("() => ({scripts:document.scripts.length,links:[...document.querySelectorAll('a')].map((node)=>node.getAttribute('href')),text:document.body.innerText})")
        assert root_state["scripts"] == 0
        assert root_state["links"] == ["/help", "/app"]
        assert "#smap" in root_state["text"]
        root.close()

        help_page = context.new_page()
        help_page.set_content((DIST / "help" / "index.html").read_text(encoding="utf-8"), wait_until="load")
        help_state = help_page.evaluate(r"""() => ({scripts:document.scripts.length,chars:[...document.querySelector('main').innerText.replace(/\s+/g,'')].length,text:document.querySelector('main').innerText,links:[...document.querySelectorAll('a')].map((node)=>node.getAttribute('href'))})""")
        assert help_state["scripts"] == 0
        assert help_state["chars"] <= 2_000
        assert help_state["links"] == ["/", "/app", "/app/example"]
        for marker in ["DecisionLog", "State", "Proposal", "Envelope/3", "#smap", "map/1", "graph/1", "seq/1", "chart/1", "GeoSpec", "Policy", "@mount/", "YAGNI", "KISS", "DRY", "SOLID"]:
            assert marker in help_state["text"]
        help_page.close()

        example = load_app(context, DIST / "app" / "example" / "index.html", errors)
        initial = example.evaluate(
            """() => ({
              href:location.href,
              mode:semanticMapSite.mode,
              head:semanticMapRuntime.head,
              stateHash:semanticMapRuntime.stateHash,
              log:semanticMapRuntime.log,
              view:semanticMapRuntime.view,
              proposal:semanticMapRuntime.proposal,
              draft:semanticMapRuntime.draftCount(),
              regions:semanticMapApp.store.domain.regions.size,
              relations:semanticMapApp.store.domain.relations.length,
              patterns:[...document.getElementById('pattern-select').options].map((item)=>item.value),
              scene:semanticMapApp.snapshot().scene,
              modules:semanticMapApp.snapshot().modules,
              svg:Boolean(document.querySelector('#graph-container svg')),
              obsolete:{setView:typeof semanticMapRuntime.setView,roundtrip:typeof semanticMapRoundtrip},
            })"""
        )
        assert initial["mode"] == "example"
        assert initial["href"].startswith("about:blank#smap=")
        assert initial["view"] == {"pattern": "map/1", "frame": {"select": ["plan"]}}
        assert initial["proposal"] is None and initial["draft"] == 0
        assert initial["regions"] == 11 and initial["relations"] == 6
        assert initial["patterns"] == ["map/1", "graph/1", "seq/1", "chart/1"]
        assert initial["scene"]["scenePatterns"] == ["root:map/1"]
        assert initial["modules"] == {"mounted": 1, "regions": 18, "maxDepth": 1, "error": None}
        assert initial["svg"] is True
        assert initial["obsolete"] == {"setView": "undefined", "roundtrip": "undefined"}

        source_export = example.evaluate(
            """async () => {
              await semanticMapSource.open();
              const state=semanticMapSource.current();
              const expectedState=semanticMapApp.exportJSONL();
              const select=document.getElementById('source-format');
              select.value='log';
              await semanticMapSource.render('log');
              const log=semanticMapSource.current();
              select.value='envelope';
              await semanticMapSource.render('envelope');
              const envelope=semanticMapSource.current();
              const parsed=JSON.parse(envelope.text);
              const original=Object.getOwnPropertyDescriptor(navigator,'clipboard');
              Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(){throw new Error('clipboard denied');}}});
              let copyError=null;
              try { await semanticMapSource.copy(); } catch (error) { copyError=error.message; }
              if (original) Object.defineProperty(navigator,'clipboard',original); else delete navigator.clipboard;
              semanticMapSource.close();
              return {
                stateMatches:state.text===expectedState,
                stateEndsLf:state.text.endsWith('\\n'),
                stateLines:state.text.trimEnd().split('\\n').length,
                logMatches:log.text===semanticMapRuntime.log,
                logEndsLf:log.text.endsWith('\\n'),
                envelopeSchema:parsed.schema,
                envelopeLogMatches:parsed.log===semanticMapRuntime.log,
                envelopeEndsLf:envelope.text.endsWith('\\n'),
                formats:[...select.options].map((item)=>item.value),
                copyError,
                hidden:document.getElementById('source-layer').hidden,
              };
            }"""
        )
        assert source_export == {
            "stateMatches": True,
            "stateEndsLf": True,
            "stateLines": 18,
            "logMatches": True,
            "logEndsLf": True,
            "envelopeSchema": "semantic-map-envelope/3",
            "envelopeLogMatches": True,
            "envelopeEndsLf": True,
            "formats": ["state", "log", "envelope"],
            "copyError": "clipboard denied",
            "hidden": True,
        }
        example.evaluate("semanticMapSource.open()")
        source_layout = boxes(example, ["source-format", "source-output", "source-copy"])
        assert source_layout["withinViewport"] is True and source_layout["overlaps"] == []
        example.evaluate("semanticMapSource.close()")
        source_button = boxes(example, ["source-open"])
        assert source_button["withinViewport"] is True

        mobile_gesture = example.evaluate(
            """async () => {
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const adapter=semanticMapApp.adapter;
              const projector=semanticMapApp.projector;
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

              const container=document.getElementById('graph-container');
              const cell=adapter.cellsByRegionId.get('plan');
              const shape=adapter.graph.getView().getState(cell).shape.node;
              const bounds=()=>{
                const rect=shape.getBoundingClientRect();
                return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
              };
              const fire=(type,id,x,y)=>container.dispatchEvent(new PointerEvent(type,{
                bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',
                clientX:x,clientY:y,isPrimary:id===1,buttons:type==='pointerup'?0:1,
              }));

              const before=bounds();
              fire('pointerdown',1,100,300);
              fire('pointerdown',2,300,300);
              for(let index=0;index<8;index+=1){
                fire('pointermove',1,100-index*2,300);
                fire('pointermove',2,300+index*8,300);
                await new Promise((resolve)=>requestAnimationFrame(resolve));
              }
              const during={
                counts:{...counts},
                touch:semanticMapApp.snapshot().touch,
                bounds:bounds(),
                canvasTransform:adapter.graph.getView().getCanvas().style.transform,
                overlayTransform:adapter.overlayRoot.style.transform,
              };
              fire('pointerup',2,356,300);
              fire('pointerup',1,86,300);
              await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const after={
                counts:{...counts},
                touch:semanticMapApp.snapshot().touch,
                camera:semanticMapApp.snapshot().camera,
                bounds:bounds(),
                canvasTransform:adapter.graph.getView().getCanvas().style.transform,
                overlayTransform:adapter.overlayRoot.style.transform,
              };

              adapter.setCamera=original.setCamera;
              adapter.previewCamera=original.previewCamera;
              projector.project=original.project;
              adapter.render=original.render;
              return {before,during,after};
            }"""
        )
        assert mobile_gesture["during"]["counts"] == {
            "setCamera": 0, "previewCamera": 16, "project": 0, "render": 0,
        }
        assert mobile_gesture["during"]["touch"]["mode"] == "pinch"
        assert mobile_gesture["during"]["touch"]["preview"]["active"] is True
        assert mobile_gesture["during"]["canvasTransform"].startswith("matrix(")
        assert mobile_gesture["during"]["overlayTransform"] == mobile_gesture["during"]["canvasTransform"]
        assert mobile_gesture["after"]["counts"] == {
            "setCamera": 1, "previewCamera": 16, "project": 1, "render": 1,
        }
        assert mobile_gesture["after"]["touch"]["mode"] == "idle"
        assert mobile_gesture["after"]["touch"]["preview"] == {"active": False, "camera": None}
        assert mobile_gesture["after"]["camera"] == mobile_gesture["during"]["touch"]["preview"]["camera"]
        assert mobile_gesture["after"]["canvasTransform"] == ""
        assert mobile_gesture["after"]["overlayTransform"] == ""
        for field in ["x", "y", "width", "height"]:
            # maxGraph commits translated SVG coordinates at sub-pixel precision;
            # the preview and committed geometry must remain within one measured CSS pixel.
            delta = abs(mobile_gesture["during"]["bounds"][field] - mobile_gesture["after"]["bounds"][field])
            assert delta <= 1, {"field": field, "delta": delta, "gesture": mobile_gesture}

        view_results = example.evaluate(
            """async () => {
              const semantic=()=>({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,records:JSON.stringify(semanticMapRuntime.records)});
              const before=semantic();
              const values=[];
              for (const view of [
                {pattern:'graph/1'},
                {pattern:'seq/1',seq:{groupBy:'actor',axis:'ordinal'}},
                {pattern:'seq/1',seq:{groupBy:'task',axis:'calendar'}},
                {pattern:'map/1'},
              ]) {
                await semanticMapSite.changePattern(view);
                values.push({view:semanticMapRuntime.view,scene:semanticMapApp.snapshot().scene.pattern,semantic:semantic()});
              }
              return {before,values,after:semantic()};
            }"""
        )
        assert view_results["before"] == view_results["after"]
        assert all(item["semantic"] == view_results["before"] for item in view_results["values"])
        assert [item["scene"] for item in view_results["values"]] == ["graph/1", "seq/1", "seq/1", "map/1"]

        temporal_draft = example.evaluate(
            """async () => {
              await semanticMapSite.changePattern({pattern:'seq/1',seq:{groupBy:'task',axis:'calendar'}});
              const before=structuredClone(semanticMapApp.store.domain.regions.get('capture').temporal);
              const accepted={head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log};
              const cell=semanticMapApp.adapter.cellsByRegionId.get('capture');
              const unitWidth=cell.semantic.temporalEdit.unitWidth;
              const [{default:EventObject},{default:InternalEvent}]=await Promise.all([
                import('semantic:vendor/maxgraph/view/event/EventObject.js'),
                import('semantic:vendor/maxgraph/view/event/InternalEvent.js'),
              ]);
              semanticMapApp.adapter.graph.fireEvent(new EventObject(InternalEvent.CELLS_MOVED,{cells:[cell],dx:unitWidth,dy:0,disconnect:false}));
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const changed=structuredClone(semanticMapApp.store.domain.regions.get('capture').temporal);
              const draft=semanticMapRuntime.draftOperations();
              semanticMapApp.undo();
              const restored=structuredClone(semanticMapApp.store.domain.regions.get('capture').temporal);
              return {
                before,changed,restored,draft,accepted,
                after:{head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log},
                draftAfter:semanticMapRuntime.draftCount(),
              };
            }"""
        )
        assert temporal_draft["accepted"] == temporal_draft["after"]
        assert temporal_draft["changed"]["ordinal"] == temporal_draft["before"]["ordinal"]
        assert temporal_draft["changed"]["calendar"] == {"start": "2026-08-05", "end": "2026-08-07"}
        assert temporal_draft["restored"] == temporal_draft["before"]
        assert temporal_draft["draft"] == [{
            "type": "PlaceTemporalRegions",
            "axis": "calendar",
            "items": [{"regionId": "capture", "actor": "app", "start": "2026-08-05", "end": "2026-08-07"}],
        }]
        assert temporal_draft["draftAfter"] == 0
        example.evaluate("semanticMapSite.changePattern({pattern:'map/1'})")

        low_host = example.evaluate(
            """() => {
              const item=semanticMapApp.adapter.lastScene.representations.find((value)=>value.regionId==='portal');
              return {representationId:item.representationId,detailsVisible:item.detailsVisible,scenes:semanticMapApp.snapshot().scene.scenePatterns};
            }"""
        )
        assert low_host["detailsVisible"] is False
        assert low_host["scenes"] == ["root:map/1"]
        example.evaluate("semanticMapApp.focusRegion('portal', 5)")
        example.wait_for_function("semanticMapApp.snapshot().scene.scenePatterns.some((value)=>value.startsWith('@mount/portal:seq/1'))", timeout=30_000)
        high_host = example.evaluate(
            """() => {
              const scene=semanticMapApp.adapter.lastScene;
              const item=scene.representations.find((value)=>value.regionId==='portal');
              return {representationId:item.representationId,detailsVisible:item.detailsVisible,scenes:semanticMapApp.snapshot().scene.scenePatterns,readOnly:scene.representations.filter((value)=>value.readOnly).length,relationEndpoints:scene.relations.map((value)=>`${value.from}->${value.to}`)};
            }"""
        )
        assert high_host["representationId"] == low_host["representationId"]
        assert high_host["detailsVisible"] is True
        assert high_host["readOnly"] > 0
        assert all("@mount/portal" not in endpoint or "->portal" not in endpoint for endpoint in high_host["relationEndpoints"])
        example.evaluate("semanticMapApp.reset()")

        before_accept = example.evaluate("() => ({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,href:location.href,label:semanticMapApp.store.domain.regions.get('plan').label})")
        operation_result = example.evaluate("semanticMapApp.operation({type:'RenameRegion',regionId:'plan',label:'Canonical Proposal'})")
        assert operation_result == {"regionIds": ["plan"]}
        draft = example.evaluate("() => ({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,count:semanticMapRuntime.draftCount(),label:semanticMapApp.store.domain.regions.get('plan').label})")
        assert draft["head"] == before_accept["head"] and draft["stateHash"] == before_accept["stateHash"] and draft["log"] == before_accept["log"]
        assert draft["count"] == 1 and draft["label"] == "Canonical Proposal"
        example.evaluate("semanticMapReview.openDraft()")
        example.wait_for_function("semanticMapReview.pending() !== null")
        review_layout = boxes(example, ["review-accept", "review-reject", "review-copy-before", "review-copy-after"])
        assert review_layout["withinViewport"] is True and review_layout["overlaps"] == []
        accepted = example.evaluate("semanticMapReview.acceptPending()")
        assert accepted["decisionId"] != before_accept["head"]
        after_accept = example.evaluate("() => ({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,href:location.href,draft:semanticMapRuntime.draftCount(),label:semanticMapApp.store.domain.regions.get('plan').label,proposal:semanticMapRuntime.proposal})")
        assert after_accept["head"] == accepted["decisionId"]
        assert after_accept["stateHash"] == accepted["stateHash"]
        assert after_accept["log"] == accepted["log"]
        assert after_accept["href"].startswith("about:blank#smap=")
        assert after_accept["draft"] == 0 and after_accept["label"] == "Canonical Proposal" and after_accept["proposal"] is None

        before_reject = example.evaluate("() => ({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,href:location.href,label:semanticMapApp.store.domain.regions.get('plan').label})")
        example.evaluate("semanticMapApp.operation({type:'RenameRegion',regionId:'plan',label:'Rejected Draft'})")
        example.evaluate("semanticMapReview.openDraft()")
        example.wait_for_function("semanticMapReview.pending() !== null")
        assert example.evaluate("semanticMapReview.rejectPending()") is True
        after_reject = example.evaluate("() => ({head:semanticMapRuntime.head,stateHash:semanticMapRuntime.stateHash,log:semanticMapRuntime.log,href:location.href,label:semanticMapApp.store.domain.regions.get('plan').label,draft:semanticMapRuntime.draftCount()})")
        assert after_reject == {**before_reject, "draft": 0}

        handoff = example.evaluate(
            """async () => {
              globalThis.__semanticTransferLastCopy = undefined;
              const before = semanticMapHandoff.imageGenerationCount();
              await semanticMapHandoff.open();
              const text = await semanticMapHandoff.prepareTextTransfer();
              const afterText = semanticMapHandoff.imageGenerationCount();
              const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
              Object.defineProperty(navigator, 'clipboard', {
                configurable:true,
                value:{async writeText() { throw new Error('clipboard denied'); }},
              });
              let copyError = null;
              try { await semanticMapHandoff.copyTextOnly(); }
              catch (error) { copyError = error.message; }
              if (original) Object.defineProperty(navigator, 'clipboard', original);
              else delete navigator.clipboard;
              const image = await semanticMapHandoff.prepareImageTransfer();
              const afterImage = semanticMapHandoff.imageGenerationCount();
              semanticMapHandoff.close();
              return {
                text,
                before,
                afterText,
                afterImage,
                copyError,
                lastCopy:globalThis.__semanticTransferLastCopy ?? null,
                image:{
                  svgChars:image.svgText.length,
                  overlay:image.svgText.includes('data-semantic-overlay="terrain-sets"'),
                  terrain:image.svgText.includes('data-layer="terrain"'),
                  sets:image.svgText.includes('data-layer="sets"'),
                },
              };
            }"""
        )
        transfer = handoff["text"]
        assert transfer["stateUrl"].startswith("about:blank#smap=")
        assert transfer["manifest"]["head"] == after_reject["head"]
        assert transfer["manifest"]["view"]["pattern"] == "map/1"
        assert "#doc" not in transfer["clipboardText"] and "#apply" not in transfer["clipboardText"]
        assert transfer["textChars"] <= 24_000 and transfer["textBytes"] <= 64_000
        assert transfer["imagePrepared"] is False
        assert handoff["afterText"] == handoff["before"], "text preparation generated an image"
        assert handoff["afterImage"] == handoff["before"] + 1
        assert handoff["copyError"] == "clipboard denied" and handoff["lastCopy"] is None
        assert handoff["image"]["svgChars"] > 0
        assert handoff["image"]["overlay"] and handoff["image"]["terrain"] and handoff["image"]["sets"]

        mobile_dock = boxes(example, ["add-node", "undo", "redo", "delete", "open-link", "handoff-fab"])
        assert mobile_dock["withinViewport"] is True and mobile_dock["overlaps"] == []

        current_envelope = example.evaluate("semanticMapRuntime.envelope()")
        example.close()

        invalid_cases = {
            "old-fragment": "#doc=old",
            "apply-fragment": "#apply=old",
            "old-envelope": f"#smap={raw_token({**current_envelope, 'schema': 'semantic-map-envelope/2'})}",
            "old-pattern": f"#smap={raw_token({**current_envelope, 'view': {'pattern': 'flow/1'}})}",
            "flat-view": f"#smap={raw_token({**current_envelope, 'view': {'pattern': 'map/1', 'select': ['plan']}})}",
            "bad-token": "#smap=not-gzip",
        }
        invalid_errors: dict[str, str] = {}
        for name, fragment in invalid_cases.items():
            page = load_app(context, DIST / "app" / "index.html", errors, fragment=fragment, expect_ready=False)
            state = page.evaluate("() => ({error:semanticMapSite.error,runtime:typeof semanticMapRuntime,app:typeof semanticMapApp})")
            assert state["runtime"] == "undefined" and state["app"] == "undefined"
            invalid_errors[name] = state["error"]
            page.close()
        assert "unsupported fragment" in invalid_errors["old-fragment"]
        assert "unsupported fragment" in invalid_errors["apply-fragment"]
        assert "semantic-map-envelope/3" in invalid_errors["old-envelope"]
        assert "unsupported Pattern flow/1" in invalid_errors["old-pattern"]
        assert "View.select is not allowed" in invalid_errors["flat-view"]
        assert "invalid gzip payload" in invalid_errors["bad-token"]

        blank = load_app(context, DIST / "app" / "index.html", errors)
        blank_state = blank.evaluate("() => ({ready:semanticMapSite.ready,regions:semanticMapApp.store.domain.regions.size,view:semanticMapRuntime.view,href:location.href})")
        assert blank_state["ready"] is True and blank_state["regions"] == 1
        assert blank_state["view"] == {"pattern": "map/1"}
        assert blank_state["href"].startswith("about:blank#smap=")
        blank.close()

        browser.close()

    network_requests = [url for url in requests if not url.startswith(("data:", "blob:"))]
    assert network_requests == [], network_requests
    assert not errors, errors
    print(json.dumps({
        "schema": "semantic-map-browser-e2e/3",
        "pass": True,
        "status": "PASS",
        "skipped": False,
        "complete": True,
        "errors": [],
        "initialHead": initial["head"],
        "acceptedHead": after_accept["head"],
        "patterns": initial["patterns"],
        "viewOnly": view_results["before"] == view_results["after"],
        "stableMountedHost": high_host["representationId"] == low_host["representationId"],
        "mountedReadOnly": high_host["readOnly"],
        "acceptAtomic": after_accept["head"] == accepted["decisionId"] and after_accept["draft"] == 0,
        "rejectAtomic": after_reject == {**before_reject, "draft": 0},
        "invalidCases": invalid_errors,
        "mobileReview": review_layout,
        "sourceExport": source_export,
        "mobileSource": source_layout,
        "mobileDock": mobile_dock,
        "mobileGesture": {
            "during": mobile_gesture["during"]["counts"],
            "after": mobile_gesture["after"]["counts"],
            "visualDeltaPx": max(
                abs(mobile_gesture["during"]["bounds"][field] - mobile_gesture["after"]["bounds"][field])
                for field in ["x", "y", "width", "height"]
            ),
        },
        "handoff": {
            "textChars": transfer["textChars"],
            "textBytes": transfer["textBytes"],
            "imageLazy": handoff["afterText"] == handoff["before"],
            "imageGenerationCount": handoff["afterImage"],
            "textCopyFailClosed": handoff["copyError"] == "clipboard denied" and handoff["lastCopy"] is None,
            "completeImage": handoff["image"],
        },
        "helpChars": help_state["chars"],
        "networkRequests": network_requests,
        "browserErrors": errors,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
