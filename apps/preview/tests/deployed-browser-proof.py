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


def prove_control_grid(page):
    assert page.locator("[data-a2ui-component='TreeGrid']").count() == 1
    assert page.locator("[data-a2ui-component='Tree']").count() == 0
    rows = page.locator('[data-control-row]')
    assert rows.count() == 129
    mismatch = page.eval_on_selector_all(
        '[data-control-row]',
        """rows => rows.flatMap(row => {
          const left = row.querySelector(':scope > [data-control-column="control"]');
          const right = row.querySelector(':scope > [data-control-column="claims"]');
          if (!left || !right) return [{id: row.dataset.controlRow, error: 'missing cell'}];
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return Math.abs(a.top-b.top) < 0.01 && Math.abs(a.height-b.height) < 0.01
            ? []
            : [{id: row.dataset.controlRow, leftTop:a.top, rightTop:b.top, leftHeight:a.height, rightHeight:b.height}];
        })""",
    )
    assert mismatch == [], mismatch[:5]
    reports = page.locator("[data-control-column='claims'] .property[data-key='op'][data-value='report']").count()
    missing = page.locator("[data-control-column='claims'] .property[data-key='op'][data-missing='true']").count()
    assert reports == 97
    assert missing == 32
    assert page.locator(".grid-head [data-control-column='claims'] .grid-meta").inner_text() == 'D reports · 97 / 129 reported'
    evidence = page.locator("[data-control-row='policy'] > [data-control-column='claims'] .property[data-key='evidence'][data-rest='true']")
    assert evidence.count() == 1
    assert 'AGENTS.zip' in evidence.inner_text()
    return {"rows": 129, "reports": reports, "missing": missing, "aligned": 129}


def prove_graph_pin(page):
    target = page.evaluate(
        """() => {
          const site = globalThis.semanticMapSite;
          const adapter = site?.editor?.adapter;
          if (!adapter) throw new Error('semantic-map editor adapter missing');
          const pair = [...adapter.cellsByRegionId.entries()].find(([, cell]) => (
            cell?.isVertex?.()
            && cell.semantic?.type === 'region'
            && cell.semantic?.geometryEditable === true
            && cell.semantic?.mode !== 'boundary'
            && cell.semantic?.readOnly !== true
          ));
          if (!pair) throw new Error('movable graph region missing');
          const [regionId, cell] = pair;
          const geometry = cell.getGeometry();
          const before = [geometry.x, geometry.y, geometry.width, geometry.height];
          adapter.graph.moveCells([cell], 40, 20, false);
          return {regionId, before};
        }""",
    )
    region_id = target['regionId']
    page.wait_for_function(
        """regionId => {
          const site = globalThis.semanticMapSite;
          const pinned = site?.editor?.snapshot?.().layout?.some(record => record.regionId === regionId);
          const cell = site?.editor?.adapter?.cellsByRegionId?.get(regionId);
          const indicator = [...document.querySelectorAll('[data-layout-pin]')]
            .some(node => node.getAttribute('data-layout-pin') === regionId);
          return pinned && cell?.semantic?.layoutPinned === true && indicator;
        }""",
        arg=region_id,
        timeout=5_000,
    )
    pinned = page.evaluate(
        """regionId => {
          const site = globalThis.semanticMapSite;
          const record = site.editor.snapshot().layout.find(item => item.regionId === regionId);
          const cell = site.editor.adapter.cellsByRegionId.get(regionId);
          const indicator = [...document.querySelectorAll('[data-layout-pin]')]
            .some(node => node.getAttribute('data-layout-pin') === regionId);
          return {bounds: record?.bounds ?? null, indicator, layoutPinned: cell?.semantic?.layoutPinned === true};
        }""",
        region_id,
    )
    assert pinned['layoutPinned'] is True, pinned
    assert pinned['indicator'] is True, pinned
    assert pinned['bounds'] is not None, pinned

    page.evaluate(
        """regionId => globalThis.semanticMapSite.editor.adapter.setSelection({regionIds: [regionId], relationIds: []})""",
        region_id,
    )
    unpin = page.locator("[data-layout-action='unpin']")
    assert unpin.count() == 1
    assert not unpin.is_disabled()
    unpin.click()
    page.wait_for_function(
        """regionId => {
          const site = globalThis.semanticMapSite;
          const hasHint = site?.editor?.snapshot?.().layout?.some(record => record.regionId === regionId);
          const cell = site?.editor?.adapter?.cellsByRegionId?.get(regionId);
          const indicator = [...document.querySelectorAll('[data-layout-pin]')]
            .some(node => node.getAttribute('data-layout-pin') === regionId);
          return !hasHint && cell?.semantic?.layoutPinned !== true && !indicator;
        }""",
        arg=region_id,
        timeout=5_000,
    )
    return {
        "regionId": region_id,
        "before": target['before'],
        "pinnedBounds": pinned['bounds'],
        "indicator": True,
        "unpin": True,
    }


def prove_data_pin_controls(page):
    target_id = page.evaluate(
        """() => {
          const site = globalThis.semanticMapSite;
          const adapter = site?.editor?.adapter;
          const snapshot = site?.editor?.snapshot?.();
          if (!adapter || !snapshot) throw new Error('semantic-map editor missing');
          const pinned = new Set(snapshot.dataPins.map(item => item.targetId));
          const pair = [...adapter.cellsByRegionId.entries()].find(([, cell]) => {
            const targetId = cell?.semantic?.sourceRegionId ?? cell?.semantic?.regionId ?? null;
            return cell?.isVertex?.()
              && cell.semantic?.type === 'region'
              && cell.semantic?.mode !== 'boundary'
              && cell.semantic?.readOnly !== true
              && targetId
              && !pinned.has(targetId);
          });
          if (!pair) throw new Error('unpinned selectable data target missing');
          const [, cell] = pair;
          const targetId = cell.semantic.sourceRegionId ?? cell.semantic.regionId;
          adapter.setSelection({regionIds: [targetId], relationIds: []});
          return targetId;
        }""",
    )

    controls = page.locator("[data-data-pin-controls='true']")
    assert controls.count() == 1
    assert controls.get_attribute('data-data-pin-target') == target_id
    assert controls.get_attribute('data-data-pinned') == 'false'

    pin = page.locator("[data-data-pin-action='pin']")
    assert not pin.is_disabled()
    pin.click()
    form = page.locator("[data-data-pin-form='true']")
    assert form.is_visible()
    page.locator("[data-data-pin-basis='true']").select_option('dependency')
    reason_text = 'depends on upstream contract'
    page.locator("[data-data-pin-reason='true']").fill(reason_text)
    page.locator("[data-data-pin-action='confirm']").click()

    page.wait_for_function(
        """({targetId, reason}) => {
          const pin = globalThis.semanticMapSite?.editor?.snapshot?.().dataPins
            ?.find(item => item.targetId === targetId);
          return pin?.basis === 'dependency' && pin?.reason === reason;
        }""",
        arg={"targetId": target_id, "reason": reason_text},
        timeout=5_000,
    )
    pinned = page.evaluate(
        """targetId => {
          const site = globalThis.semanticMapSite;
          const pin = site.editor.snapshot().dataPins.find(item => item.targetId === targetId);
          const jsonl = site.editor.store.toJSONL();
          return {pin, jsonl};
        }""",
        target_id,
    )
    assert pinned['pin']['basis'] == 'dependency'
    assert pinned['pin']['reason'] == reason_text
    assert f'"targetId":"{target_id}"' in pinned['jsonl']
    assert '"type":"data-pin"' in pinned['jsonl']
    assert controls.get_attribute('data-data-pinned') == 'true'
    assert '📍 dependency' in page.locator("[data-data-pin-summary='true']").inner_text()

    unpin = page.locator("[data-data-pin-action='unpin']")
    assert unpin.is_visible()
    assert not unpin.is_disabled()
    unpin.click()
    page.wait_for_function(
        """targetId => !globalThis.semanticMapSite?.editor?.snapshot?.().dataPins
          ?.some(item => item.targetId === targetId)""",
        arg=target_id,
        timeout=5_000,
    )
    unpinned_jsonl = page.evaluate("() => globalThis.semanticMapSite.editor.store.toJSONL()")
    assert f'"targetId":"{target_id}"' not in unpinned_jsonl
    assert controls.get_attribute('data-data-pinned') == 'false'
    return {"targetId": target_id, "basis": "dependency", "reasonRequired": True, "pin": True, "jsonl": True, "unpin": True}


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
    assert [item['id'] for item in links] == launcher['cases'], (links, launcher)
    assert len({item['id'] for item in links}) == len(links)

    checked = []
    control = None
    graph_pin = None
    data_pin = None
    for item in links:
        page.goto(item['href'], wait_until='domcontentloaded', timeout=20_000)
        wait_for_status(page, 20)
        proof = page.evaluate('globalThis.uiPreviewProof')
        assert proof['status'] == 'PASS', (item, proof)
        assert proof['mode'] == 'feature', (item, proof)
        assert proof['caseId'] == item['id'], (item, proof)
        assert page.locator('#fatal').is_hidden(), item
        if item['id'] == 'control':
            control = prove_control_grid(page)
        if item['id'] == 'graph':
            graph_pin = prove_graph_pin(page)
            data_pin = prove_data_pin_controls(page)
        checked.append(item['id'])

    assert control is not None
    assert graph_pin is not None
    assert data_pin is not None
    browser.close()

print(json.dumps({"schema": "ui-preview-deployed-browser-proof/3", "status": "PASS", "base": base, "cases": checked, "control": control, "graphPin": graph_pin, "dataPin": data_pin}, ensure_ascii=False))
