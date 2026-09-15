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
        checked.append(item['id'])

    assert control is not None
    browser.close()

print(json.dumps({"schema": "ui-preview-deployed-browser-proof/2", "status": "PASS", "base": base, "cases": checked, "control": control}, ensure_ascii=False))
