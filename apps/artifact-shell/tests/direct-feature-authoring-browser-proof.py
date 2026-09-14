from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CHROMIUM = os.environ.get('CHROMIUM_EXECUTABLE')
REMOTE_BASE = os.environ.get('ARTIFACT_SHELL_BASE_URL')
EXPECTED_RECORDS = {'graph': 11, 'map': 9, 'seq': 17}
EXPECTED_PATTERN = {'graph': 'graph/1', 'map': 'map/1', 'seq': 'seq/1'}


def port() -> int:
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def poll(read, accept, message: str, timeout: float = 20.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = read()
        if accept(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f'{message}: {last!r}')


def feature_urls(base: str) -> dict[str, str]:
    script = r"""
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root,base]=process.argv.slice(2);
const { createUrlModuleUrl }=await import(pathToFileURL(path.join(root,'packages/url-module/src/index.mjs')).href);
const urls={};
for (const id of ['graph','map','seq']) {
  const value=fs.readFileSync(path.join(root,'examples',id,'example.jsonl'),'utf8');
  urls[id]=await createUrlModuleUrl({base:`${base}/adapters/${id}/`,fragment:'data',value});
}
process.stdout.write(JSON.stringify(urls));
"""
    output = subprocess.check_output(
        ['node', '--input-type=module', '-', str(ROOT), base],
        input=script,
        text=True,
    )
    return json.loads(output)


def raw_html(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        assert response.status == 200
        return response.read().decode('utf-8')


def region_point(page, region_id: str):
    return page.evaluate(
        """regionId => {
          const a=semanticMapSite.editor.adapter;
          const c=a.cellsByRegionId.get(regionId);
          const s=c ? a.graph.getView().getState(c) : null;
          const r=a.container.getBoundingClientRect();
          if (!c || !s) return null;
          return {x:r.left+s.x+s.width/2,y:r.top+s.y+s.height/2};
        }""",
        region_id,
    )


def connect_icon_point(page):
    return page.evaluate(
        """() => {
          const a=semanticMapSite.editor.adapter;
          const icon=a.graph.getPlugin('ConnectionHandler')?.icons?.[0];
          const r=a.container.getBoundingClientRect();
          return icon?.bounds ? {x:r.left+icon.bounds.x+icon.bounds.width/2,y:r.top+icon.bounds.y+icon.bounds.height/2}:null;
        }"""
    )


def target_bend_point(page, relation_id: str):
    return page.evaluate(
        """id => {
          const a=semanticMapSite.editor.adapter;
          const edge=a.edgeByRelationId.get(id);
          if (!edge) return null;
          a.graph.setSelectionCell(edge);
          const handler=a.graph.getPlugin('SelectionCellsHandler')?.getHandler(edge);
          const bend=handler?.bends?.at(-1);
          const r=a.container.getBoundingClientRect();
          return bend?.bounds ? {x:r.left+bend.bounds.x+bend.bounds.width/2,y:r.top+bend.bounds.y+bend.bounds.height/2}:null;
        }""",
        relation_id,
    )


def drag(page, start: dict[str, float], end: dict[str, float]) -> None:
    page.mouse.move(start['x'], start['y'])
    page.mouse.down()
    page.mouse.move(end['x'], end['y'], steps=12)
    page.mouse.up()


def main() -> None:
    server = None
    temp = None
    if REMOTE_BASE:
        base = REMOTE_BASE.rstrip('/')
    else:
        temp = tempfile.TemporaryDirectory()
        publication = Path(temp.name) / 'publication'
        subprocess.run(
            ['node', 'apps/artifact-shell/scripts/build-publication.mjs', f'--out={publication}'],
            cwd=ROOT,
            check=True,
        )
        listen = port()
        server = subprocess.Popen(
            ['python3', '-m', 'http.server', str(listen), '--bind', '127.0.0.1'],
            cwd=publication,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base = f'http://127.0.0.1:{listen}'
        time.sleep(0.4)

    urls = feature_urls(base)
    receipts = []
    try:
        with sync_playwright() as playwright:
            launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
            if CHROMIUM:
                launch['executable_path'] = CHROMIUM
            browser = playwright.chromium.launch(**launch)
            context = browser.new_context(viewport={'width': 1280, 'height': 900})

            for feature, url in urls.items():
                source = raw_html(url.split('#', 1)[0])
                assert '<main id="feature"></main>' in source
                assert '<svg' not in source.lower(), f'{feature} unexpectedly contains server-rendered SVG'

                page = context.new_page()
                errors: list[str] = []
                failures: list[str] = []
                bad: list[tuple[str, int]] = []
                page.on('pageerror', lambda error, bucket=errors: bucket.append(str(error)))
                page.on('requestfailed', lambda request, bucket=failures: bucket.append(request.url))
                page.on('response', lambda response, bucket=bad: bucket.append((response.url, response.status)) if response.status >= 400 else None)
                response = page.goto(url, wait_until='networkidle', timeout=30_000)
                page.wait_for_timeout(700)
                assert response and response.ok
                assert page.locator('html').get_attribute('data-status') == 'pass', (feature, errors, failures, bad)
                proof = page.evaluate('() => globalThis.uiFeatureProof')
                assert proof['feature']['id'] == feature
                assert proof['mounted']['pattern'] == EXPECTED_PATTERN[feature]
                assert proof['mounted']['records'] == EXPECTED_RECORDS[feature]
                assert proof['mounted']['authoring'] is True
                assert page.evaluate('() => globalThis.semanticMapSite?.ready') is True
                assert page.locator('iframe').count() == 0
                assert '#data=' in page.url and '#smap' not in page.url and 'smap-ref' not in page.url

                active = page.evaluate('() => semanticMapSite.editor.adapter.activeList.snapshot()')
                assert active['visible'] is True and active['items']
                active_root = page.locator('[data-maxgraph-active-list]')
                box = active_root.bounding_box()
                assert box and box['width'] > 0 and box['height'] > 0
                button = active_root.locator("button[data-active-key^='region:']").first
                button.wait_for(state='visible', timeout=30_000)
                key = button.get_attribute('data-active-key')
                assert key
                region_id = key.split(':', 1)[1]
                button.click()
                poll(
                    lambda: page.evaluate('() => semanticMapSite.editor.adapter.selectionSnapshot().regionIds'),
                    lambda ids: region_id in ids,
                    f'{feature} active-list selection did not reach maxGraph',
                )

                svg = page.locator('.semantic-map-feature-canvas svg').first
                assert svg.count() == 1
                svg_box = svg.bounding_box()
                assert svg_box and svg_box['width'] > 0 and svg_box['height'] > 0
                assert errors == [] and failures == [] and bad == [], (feature, errors, failures, bad)

                receipt = {
                    'feature': feature,
                    'pattern': EXPECTED_PATTERN[feature],
                    'records': EXPECTED_RECORDS[feature],
                    'authoring': True,
                    'activeItems': len(active['items']),
                    'selectionFromList': True,
                    'iframe': 0,
                    'ssg': False,
                    'svgVisible': True,
                }

                if feature == 'graph':
                    baseline = page.evaluate('() => semanticMapSite.editor.snapshot().domain.relations.length')
                    source_point = region_point(page, 'request')
                    build_point = region_point(page, 'build')
                    proof_point = region_point(page, 'proof')
                    assert source_point and build_point and proof_point
                    page.mouse.move(source_point['x'], source_point['y'])
                    poll(
                        lambda: page.evaluate("() => semanticMapSite.editor.adapter.graph.getPlugin('ConnectionHandler')?.icons?.length ?? 0"),
                        lambda count: count > 0,
                        'connect icon did not appear',
                    )
                    icon = poll(connect_icon_point.__get__(None), lambda _: False, '') if False else poll(
                        lambda: connect_icon_point(page),
                        lambda point: isinstance(point, dict),
                        'connect icon has no bounds',
                    )
                    drag(page, icon, build_point)
                    created = poll(
                        lambda: page.evaluate("""() => semanticMapSite.editor.snapshot().domain.relations.find(
                          relation => relation.from==='request' && relation.to==='build' && relation.kind==='relates'
                        ) ?? null"""),
                        lambda relation: isinstance(relation, dict),
                        'pointer connect did not create relation',
                    )
                    relation_id = created['id']
                    assert page.evaluate('() => semanticMapSite.editor.snapshot().domain.relations.length') == baseline + 1
                    assert page.evaluate("() => semanticMapSite.editor.store.draftSnapshot().operations.at(-1).type") == 'ConnectRegions'
                    page.evaluate('() => semanticMapSite.editor.undo()')
                    poll(
                        lambda: page.evaluate('(id) => semanticMapSite.editor.snapshot().domain.relations.some(r => r.id===id)', relation_id),
                        lambda present: present is False,
                        'connect undo failed',
                    )
                    page.evaluate('() => semanticMapSite.editor.redo()')
                    poll(
                        lambda: page.evaluate('(id) => semanticMapSite.editor.snapshot().domain.relations.some(r => r.id===id)', relation_id),
                        lambda present: present is True,
                        'connect redo failed',
                    )
                    bend = poll(
                        lambda: target_bend_point(page, relation_id),
                        lambda point: isinstance(point, dict),
                        'reconnect handle missing',
                    )
                    drag(page, bend, proof_point)
                    poll(
                        lambda: page.evaluate('(id) => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id===id)?.to ?? null', relation_id),
                        lambda target: target == 'proof',
                        'pointer reconnect failed',
                    )
                    assert page.evaluate("() => semanticMapSite.editor.store.draftSnapshot().operations.at(-1).type") == 'ReconnectRelation'
                    page.evaluate('() => semanticMapSite.editor.undo()')
                    poll(
                        lambda: page.evaluate('(id) => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id===id)?.to ?? null', relation_id),
                        lambda target: target == 'build',
                        'reconnect undo failed',
                    )
                    page.evaluate('() => semanticMapSite.editor.redo()')
                    poll(
                        lambda: page.evaluate('(id) => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id===id)?.to ?? null', relation_id),
                        lambda target: target == 'proof',
                        'reconnect redo failed',
                    )
                    receipt.update({
                        'pointerConnect': True,
                        'pointerReconnect': True,
                        'connectUndoRedo': True,
                        'reconnectUndoRedo': True,
                    })

                receipts.append(receipt)
                page.close()

            context.close()
            browser.close()

        print(json.dumps({
            'schema': 'direct-feature-authoring-browser-proof/1',
            'status': 'PASS',
            'transport': '#data',
            'base': base,
            'surfaces': receipts,
        }, ensure_ascii=False))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()
        if temp is not None:
            temp.cleanup()


if __name__ == '__main__':
    main()
