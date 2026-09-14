import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

root = os.environ['PROOF_ROOT']
out = Path(os.environ['RUNNER_TEMP']) / 'chart-pr-224-authoring-proof'
out.mkdir(parents=True, exist_ok=True)
url = f'{root}sunburst/'
events = {'pageErrors': [], 'requestFailed': []}


def activation_point(page, source_id=None, mode=None):
    return page.evaluate(
        """args => {
          const editor = window.semanticMapSite?.editor;
          if (!editor) return null;
          const adapter = editor.adapter;
          const representation = (adapter.lastScene?.representations ?? []).find(item =>
            item.activation?.kind === 'set-view'
            && (args.sourceId === null || item.sourceRegionId === args.sourceId)
            && (args.mode === null || item.mode === args.mode)
          );
          if (!representation) return null;
          const cell = adapter.cellsByRegionId.get(representation.regionId);
          const state = cell ? adapter.graph.getView().getState(cell) : null;
          if (!state) return null;
          const rect = adapter.container.getBoundingClientRect();
          let x = state.x + state.width / 2;
          let y = state.y + state.height / 2;
          const sector = representation.visual?.sector;
          if (sector) {
            const angle = ((sector.startAngle + sector.endAngle) / 2) * Math.PI / 180;
            const radius = Math.min(state.width, state.height) / 2
              * ((sector.innerRatio + sector.outerRatio) / 2);
            x += Math.cos(angle) * radius;
            y += Math.sin(angle) * radius;
          }
          return {
            x: rect.left + x,
            y: rect.top + y,
            regionId: representation.regionId,
            sourceRegionId: representation.sourceRegionId,
            mode: representation.mode,
            labelEditable: representation.labelEditable,
            readOnly: representation.readOnly,
            activation: representation.activation,
          };
        }""",
        {'sourceId': source_id, 'mode': mode},
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda exc: events['pageErrors'].append(str(exc)))
    page.on(
        'requestfailed',
        lambda req: events['requestFailed'].append({'url': req.url, 'failure': req.failure}),
    )
    response = page.goto(url, wait_until='networkidle', timeout=60_000)
    assert response is not None and response.ok, f'HTTP {response.status if response else None}'
    page.wait_for_selector('html[data-status="pass"]', timeout=60_000)

    initial = page.evaluate("""() => ({
      focus: window.semanticMapSite.editor.adapter.lastScene.scenes[0].axis.focus,
      root: window.semanticMapSite.editor.snapshot().domain.meta.root,
    })""")
    assert initial['focus'] == initial['root'] == 'company', initial

    product = activation_point(page, 'product', 'slice')
    assert product is not None, 'Sunburst product activation mark missing'
    assert product['readOnly'] is False and product['labelEditable'] is True, product
    page.mouse.click(product['x'], product['y'])
    page.wait_for_function(
        """() => window.semanticMapSite.editor.adapter.lastScene.scenes[0].axis.focus === 'product'""",
        timeout=10_000,
    )

    focused = page.evaluate("""() => window.semanticMapSite.editor.adapter.lastScene.scenes[0].axis""")
    assert focused['focus'] == 'product', focused
    assert focused['focusPath'] == ['company', 'product'], focused

    center = activation_point(page, 'product', 'point')
    assert center is not None, 'Sunburst center back activation missing'
    assert center['readOnly'] is False and center['labelEditable'] is True, center
    page.mouse.click(center['x'], center['y'])
    page.wait_for_function(
        """() => window.semanticMapSite.editor.adapter.lastScene.scenes[0].axis.focus === 'company'""",
        timeout=10_000,
    )

    restored = page.evaluate("""() => window.semanticMapSite.editor.adapter.lastScene.scenes[0].axis""")
    assert restored['focus'] == 'company', restored
    assert restored['focusPath'] == ['company'], restored
    assert not events['pageErrors'], events
    assert not events['requestFailed'], events

    screenshot = out / 'sunburst-activation.png'
    page.screenshot(path=str(screenshot), full_page=True)
    receipt = {
        'schema': 'ui.chart-sunburst-activation-proof/1',
        'status': 'PASS',
        'sourceSha': os.environ['SOURCE_SHA'],
        'url': url,
        'drilldown': {'from': 'company', 'to': 'product', 'actualClick': True},
        'back': {'from': 'product', 'to': 'company', 'actualClick': True},
        'productMarkAuthorable': True,
        'centerMarkAuthorable': True,
        'pageErrors': events['pageErrors'],
        'requestFailed': events['requestFailed'],
        'screenshot': screenshot.name,
    }
    (out / 'sunburst-activation.json').write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(receipt, ensure_ascii=False))
    browser.close()
