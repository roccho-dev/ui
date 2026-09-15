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
    assert len(links) == 14, links
    assert len({item['id'] for item in links}) == len(links)

    checked = []
    for item in links:
        page.goto(item['href'], wait_until='domcontentloaded', timeout=20_000)
        wait_for_status(page, 20)
        proof = page.evaluate('globalThis.uiPreviewProof')
        assert proof['status'] == 'PASS', (item, proof)
        assert proof['mode'] == 'feature', (item, proof)
        assert proof['caseId'] == item['id'], (item, proof)
        assert page.locator('#fatal').is_hidden(), item
        checked.append(item['id'])

    browser.close()

print(json.dumps({"schema": "ui-preview-deployed-browser-proof/1", "status": "PASS", "base": base, "cases": checked}, ensure_ascii=False))
