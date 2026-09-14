from __future__ import annotations

import json
import os
import socket
import subprocess
import time

from playwright.sync_api import sync_playwright

ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]
CAPABILITY = ROOT / 'apps' / 'artifact-shell' / 'capabilities' / 'render-semantic-map'
CHROMIUM = os.environ.get('CHROMIUM_EXECUTABLE')
REMOTE_BASE = os.environ.get('ARTIFACT_SHELL_BASE_URL')


def fixture() -> dict[str, object]:
    return json.loads((CAPABILITY / 'fixtures' / 'graph.pass.json').read_text(encoding='utf-8'))


def port() -> int:
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def poll(read, accept, message: str, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = read()
        if accept(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f'{message}: {last!r}')


def child_frame(locator):
    handle = locator.element_handle()
    assert handle is not None
    frame = handle.content_frame()
    assert frame is not None
    return frame


def submit_request(page, request: dict[str, object]) -> None:
    payload = json.dumps(request, ensure_ascii=False)
    page.evaluate(
        """payload => {
          const request = document.querySelector('#request');
          request.value = payload;
          request.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('#request-form').requestSubmit();
        }""",
        payload,
    )


def local_region_point(child, region_id: str) -> dict[str, float]:
    return child.evaluate(
        """regionId => {
          const adapter = semanticMapSite.editor.adapter;
          const cell = adapter.cellsByRegionId.get(regionId);
          const state = adapter.graph.getView().getState(cell);
          const rect = adapter.container.getBoundingClientRect();
          if (!cell || !state) throw new Error(`region not rendered: ${regionId}`);
          return {
            x: rect.left + state.x + state.width / 2,
            y: rect.top + state.y + state.height / 2,
          };
        }""",
        region_id,
    )


def local_connect_icon_point(child) -> dict[str, float]:
    return child.evaluate(
        """() => {
          const adapter = semanticMapSite.editor.adapter;
          const connection = adapter.graph.getPlugin('ConnectionHandler');
          const icon = connection?.icons?.[0];
          if (!icon?.bounds) return null;
          const rect = adapter.container.getBoundingClientRect();
          return {
            x: rect.left + icon.bounds.x + icon.bounds.width / 2,
            y: rect.top + icon.bounds.y + icon.bounds.height / 2,
          };
        }"""
    )


def local_target_bend_point(child, relation_id: str) -> dict[str, float] | None:
    return child.evaluate(
        """relationId => {
          const adapter = semanticMapSite.editor.adapter;
          const graph = adapter.graph;
          const edge = adapter.edgeByRelationId.get(relationId);
          if (!edge) return null;
          graph.setSelectionCell(edge);
          const handler = graph.getPlugin('SelectionCellsHandler')?.getHandler(edge);
          const bend = handler?.bends?.at(-1);
          if (!bend?.bounds) return null;
          const rect = adapter.container.getBoundingClientRect();
          return {
            x: rect.left + bend.bounds.x + bend.bounds.width / 2,
            y: rect.top + bend.bounds.y + bend.bounds.height / 2,
          };
        }""",
        relation_id,
    )


def to_page(frame_box: dict[str, float], point: dict[str, float]) -> tuple[float, float]:
    return frame_box['x'] + point['x'], frame_box['y'] + point['y']


def drag(page, start: tuple[float, float], end: tuple[float, float]) -> None:
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=12)
    page.mouse.up()


def main() -> None:
    server = None
    if REMOTE_BASE:
        base = REMOTE_BASE.rstrip('/')
        entry = f'{base}/index.html'
    else:
        listen = port()
        server = subprocess.Popen(
            ['python3', '-m', 'http.server', str(listen), '--bind', '127.0.0.1'],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base = f'http://127.0.0.1:{listen}'
        entry = f'{base}/apps/artifact-shell/index.html'

    errors: list[str] = []
    try:
        if server is not None:
            time.sleep(0.4)
        with sync_playwright() as playwright:
            launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
            if CHROMIUM:
                launch['executable_path'] = CHROMIUM
            browser = playwright.chromium.launch(**launch)
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(entry, wait_until='networkidle', timeout=30_000)
            page.evaluate("() => { document.body.dataset.mode = 'invoke'; }")
            status = page.locator('#status')
            status.wait_for(state='attached', timeout=30_000)
            submit_request(page, fixture()['request'])
            poll(
                lambda: status.get_attribute('data-state'),
                lambda state: state in {'pass', 'fail'},
                'artifact shell did not settle',
            )
            assert status.get_attribute('data-state') == 'pass', status.text_content()

            frame_element = page.locator("#surface iframe[data-package='semantic-map']")
            frame_element.wait_for(state='visible', timeout=30_000)
            frame_box = frame_element.bounding_box()
            assert frame_box is not None
            child = child_frame(frame_element)
            poll(
                lambda: child.evaluate("() => globalThis.semanticMapSite ? semanticMapSite.ready : null"),
                lambda ready: ready is True,
                'semantic map did not become ready',
            )
            assert child.evaluate("() => semanticMapSite.editor.snapshot().scene.pattern") == 'graph/1'

            baseline = child.evaluate("() => semanticMapSite.editor.snapshot().domain.relations.length")
            source = to_page(frame_box, local_region_point(child, 'request'))
            build = to_page(frame_box, local_region_point(child, 'build'))
            page.mouse.move(*source)
            poll(
                lambda: child.evaluate("() => semanticMapSite.editor.adapter.graph.getPlugin('ConnectionHandler')?.icons?.length ?? 0"),
                lambda count: count > 0,
                'connect icon did not appear',
            )
            icon = poll(
                lambda: local_connect_icon_point(child),
                lambda point: isinstance(point, dict),
                'connect icon has no bounds',
            )
            drag(page, to_page(frame_box, icon), build)

            created = poll(
                lambda: child.evaluate(
                    """() => semanticMapSite.editor.snapshot().domain.relations.find(
                      relation => relation.from === 'request' && relation.to === 'build' && relation.kind === 'relates'
                    ) ?? null"""
                ),
                lambda relation: isinstance(relation, dict),
                'pointer connect did not create a semantic relation',
            )
            relation_id = created['id']
            assert child.evaluate("() => semanticMapSite.editor.snapshot().domain.relations.length") == baseline + 1
            poll(
                lambda: child.evaluate("() => semanticMapSite.editor.adapter.selectionSnapshot().relationIds",),
                lambda ids: relation_id in ids,
                'new relation was not selected',
            )
            assert child.evaluate("() => semanticMapSite.editor.store.draftSnapshot().operations.at(-1).type") == 'ConnectRegions'

            child.evaluate("() => semanticMapSite.editor.undo()")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.snapshot().domain.relations.some(r => r.id === id)", relation_id),
                lambda present: present is False,
                'undo did not remove created relation',
            )
            child.evaluate("() => semanticMapSite.editor.redo()")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.snapshot().domain.relations.some(r => r.id === id)", relation_id),
                lambda present: present is True,
                'redo did not restore created relation',
            )

            bend = poll(
                lambda: local_target_bend_point(child, relation_id),
                lambda point: isinstance(point, dict),
                'target reconnect handle did not appear',
            )
            proof = to_page(frame_box, local_region_point(child, 'proof'))
            drag(page, to_page(frame_box, bend), proof)
            reconnected = poll(
                lambda: child.evaluate("id => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id === id) ?? null", relation_id),
                lambda relation: isinstance(relation, dict) and relation.get('to') == 'proof',
                'pointer reconnect did not update the semantic relation',
            )
            assert reconnected['from'] == 'request'
            assert child.evaluate("() => semanticMapSite.editor.store.draftSnapshot().operations.at(-1).type") == 'ReconnectRelation'

            child.evaluate("() => semanticMapSite.editor.undo()")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id === id)?.to ?? null", relation_id),
                lambda target: target == 'build',
                'reconnect undo did not restore old target',
            )
            child.evaluate("() => semanticMapSite.editor.redo()")
            poll(
                lambda: child.evaluate("id => semanticMapSite.editor.snapshot().domain.relations.find(r => r.id === id)?.to ?? null", relation_id),
                lambda target: target == 'proof',
                'reconnect redo did not restore new target',
            )

            assert errors == [], errors
            browser.close()

        print(json.dumps({
            'schema': 'maxgraph-edge-authoring-browser-proof/1',
            'status': 'PASS',
            'pointerConnect': True,
            'pointerReconnect': True,
            'stableRelationId': True,
            'connectUndoRedo': True,
            'reconnectUndoRedo': True,
            'base': base,
        }, ensure_ascii=False))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == '__main__':
    main()
