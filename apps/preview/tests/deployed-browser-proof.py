import json
import sys
import time

from playwright.sync_api import sync_playwright

if len(sys.argv) != 2:
    raise SystemExit('usage: deployed-browser-proof.py <base-url>')
base = sys.argv[1].rstrip('/') + '/'


def wait_for_status(page, timeout_seconds=20):
    deadline = time.monotonic() + timeout_seconds
    last = None
    while time.monotonic() < deadline:
        last = page.locator('html').get_attribute('data-status')
        if last in {'pass', 'fail'}:
            if last != 'pass':
                fatal = page.locator('#fatal')
                detail = fatal.text_content() if fatal.count() and fatal.is_visible() else ''
                raise AssertionError(f'preview failed: {detail}')
            return
        time.sleep(0.05)
    raise AssertionError(f'preview status did not settle: {last!r}')


def wait_for(page, expression, timeout_seconds=10):
    deadline = time.monotonic() + timeout_seconds
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate(expression)
        if last:
            return last
        time.sleep(0.05)
    raise AssertionError(f'condition did not settle: {expression}; last={last!r}')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})

    last_error = None
    for _ in range(10):
        try:
            page.goto(base, wait_until='domcontentloaded', timeout=15_000)
            wait_for_status(page, 15)
            last_error = None
            break
        except Exception as error:
            last_error = error
            time.sleep(2)
    if last_error is not None:
        raise last_error

    launcher = page.evaluate('globalThis.uiPreviewProof')
    assert launcher['status'] == 'PASS'
    assert launcher['mode'] == 'launcher'
    links = page.locator('#cases a').evaluate_all("nodes => nodes.map(node => ({ id: node.textContent, href: node.href }))")
    assert len(links) == 15, links
    assert len({item['id'] for item in links}) == len(links)

    checked = []
    layout_proof = None
    for item in links:
        page.goto(item['href'], wait_until='domcontentloaded', timeout=20_000)
        wait_for_status(page, 20)
        proof = page.evaluate('globalThis.uiPreviewProof')
        assert proof['status'] == 'PASS', (item, proof)
        assert proof['mode'] == 'feature', (item, proof)
        assert proof['caseId'] == item['id'], (item, proof)
        assert page.locator('#fatal').is_hidden(), item

        if item['id'] == 'graph/pinned':
            initial = wait_for(page, """() => {
              const site = globalThis.semanticMapSite;
              if (!site?.editor?.adapter?.cellsByRegionId) return null;
              const layout = site.editor.snapshot().layout;
              const cell = site.editor.adapter.cellsByRegionId.get('review');
              const geometry = cell?.getGeometry?.();
              if (!geometry || layout.length !== 1) return null;
              return {
                layout,
                geometry: [geometry.x, geometry.y, geometry.width, geometry.height],
              };
            }""")
            assert initial['layout'][0]['regionId'] == 'review', initial
            assert initial['layout'][0]['pin'] == 'hard', initial
            assert initial['geometry'] == [520, 260, 180, 92], initial

            page.evaluate("""() => {
              const adapter = globalThis.semanticMapSite.editor.adapter;
              const cell = adapter.cellsByRegionId.get('review');
              adapter.graph.setSelectionCell(cell);
              adapter.graph.moveCells([cell], 40, 20, false);
            }""")
            moved = wait_for(page, """() => {
              const snapshot = globalThis.semanticMapSite?.editor?.snapshot?.();
              const last = snapshot?.draft?.operations?.at?.(-1);
              if (last?.type !== 'PinRegions') return null;
              const pin = snapshot.layout.find(item => item.regionId === 'review');
              return pin?.bounds?.[0] === 560 && pin?.bounds?.[1] === 280 ? snapshot : null;
            }""")
            assert moved['layout'][0]['bounds'] == [560, 280, 180, 92], moved

            page.evaluate("""() => globalThis.semanticMapSite.editor.adapter.setSelection({
              regionIds: ['review'], relationIds: []
            })""")
            unpin = page.locator('button[data-layout-action="unpin"]')
            assert unpin.is_enabled(), 'graph/pinned: Unpin must be enabled for pinned selection'
            unpin.click()
            cleared = wait_for(page, """() => {
              const snapshot = globalThis.semanticMapSite?.editor?.snapshot?.();
              const last = snapshot?.draft?.operations?.at?.(-1);
              return snapshot?.layout?.length === 0 && last?.type === 'UnpinRegions' ? snapshot : null;
            }""")
            layout_proof = {
                'initial': initial['geometry'],
                'moved': moved['layout'][0]['bounds'],
                'unpinned': len(cleared['layout']) == 0,
            }

        checked.append(item['id'])

    browser.close()

assert layout_proof and layout_proof['unpinned'], layout_proof
print(json.dumps({
    "schema": "ui-preview-deployed-browser-proof/2",
    "status": "PASS",
    "base": base,
    "cases": checked,
    "graphLayout": layout_proof,
}, ensure_ascii=False))
