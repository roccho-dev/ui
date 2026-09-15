from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
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


def region_hit(child, region_id: str):
    return child.evaluate(
        """regionId => {
          const adapter = semanticMapSite.editor.adapter;
          const cell = adapter.cellsByRegionId.get(regionId);
          const state = cell ? adapter.graph.getView().getState(cell) : null;
          const shape = state?.shape?.node ?? null;
          const text = state?.text?.node ?? null;
          if (!cell || !state || !shape) return null;
          const rect = shape.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          const owned = [shape, text].filter(Boolean).some(node => node === hit || node.contains(hit));
          return {
            x, y,
            width: rect.width,
            height: rect.height,
            hitOwned: owned,
            hitTag: hit?.tagName ?? null,
          };
        }""",
        region_id,
    )


def connect_handle_hit(child):
    return child.evaluate(
        """() => {
          const connection = semanticMapSite.editor.adapter.graph.getPlugin('ConnectionHandler');
          const icon = connection?.icons?.[0] ?? null;
          const node = icon?.node ?? null;
          if (!node || !node.isConnected) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {
            x, y,
            width: rect.width,
            height: rect.height,
            display: style.display,
            visibility: style.visibility,
            pointerEvents: style.pointerEvents,
            hitSelf: hit === node || node.contains(hit),
            hitTag: hit?.tagName ?? null,
            cursor: style.cursor,
          };
        }"""
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
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
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
                lambda: child.evaluate("() => globalThis.semanticMapSite?.ready ?? null"),
                lambda ready: ready is True,
                'semantic map did not become ready',
            )

            source = poll(lambda: region_hit(child, 'request'), lambda value: isinstance(value, dict), 'source DOM missing')
            target = poll(lambda: region_hit(child, 'build'), lambda value: isinstance(value, dict), 'target DOM missing')
            assert source['hitOwned'] is True, source
            assert target['hitOwned'] is True, target
            assert source['width'] > 0 and source['height'] > 0, source
            assert target['width'] > 0 and target['height'] > 0, target

            baseline = child.evaluate("() => semanticMapSite.editor.snapshot().domain.relations.length")
            page.mouse.move(*to_page(frame_box, source))
            handle = poll(
                lambda: connect_handle_hit(child),
                lambda value: isinstance(value, dict) and value.get('width', 0) > 0,
                'visible connect handle did not appear',
            )
            assert handle['display'] != 'none', handle
            assert handle['visibility'] != 'hidden', handle
            assert handle['pointerEvents'] != 'none', handle
            assert handle['hitSelf'] is True, handle
            assert handle['cursor'] == 'pointer', handle

            drag(page, to_page(frame_box, handle), to_page(frame_box, target))
            created = poll(
                lambda: child.evaluate(
                    """() => semanticMapSite.editor.snapshot().domain.relations.find(
                      relation => relation.from === 'request' && relation.to === 'build' && relation.kind === 'relates'
                    ) ?? null"""
                ),
                lambda relation: isinstance(relation, dict),
                'drag from visible hit-tested handle did not create relation',
            )
            assert child.evaluate("() => semanticMapSite.editor.snapshot().domain.relations.length") == baseline + 1
            assert child.evaluate("() => semanticMapSite.editor.store.draftSnapshot().operations.at(-1).type") == 'ConnectRegions'
            assert errors == [], errors
            browser.close()

        print(json.dumps({
            'schema': 'maxgraph-edge-hit-target-browser-proof/1',
            'status': 'PASS',
            'visibleHandle': True,
            'elementFromPointHitsHandle': True,
            'humanStylePointerDrag': True,
            'createdRelationId': created['id'],
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
