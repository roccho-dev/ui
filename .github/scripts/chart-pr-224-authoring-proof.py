import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

root = os.environ['PROOF_ROOT']
out = Path(os.environ['RUNNER_TEMP']) / 'chart-pr-224-authoring-proof'
out.mkdir(parents=True, exist_ok=True)
variants = ['bar-horizontal', 'bar-vertical', 'line', 'pie', 'donut', 'scatter', 'heatmap', 'sunburst']
receipts = []


def domain_label(page, region_id):
    return page.evaluate(
        """regionId => window.semanticMapSite.editor.snapshot().domain.regions.find(item => item.id === regionId)?.label ?? null""",
        region_id,
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for variant in variants:
        events = {'pageErrors': [], 'requestFailed': []}
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda exc, events=events: events['pageErrors'].append(str(exc)))
        page.on(
            'requestfailed',
            lambda req, events=events: events['requestFailed'].append({'url': req.url, 'failure': req.failure}),
        )
        url = f'{root}{variant}/'
        response = page.goto(url, wait_until='networkidle', timeout=60_000)
        assert response is not None and response.ok, f'{variant}: HTTP {response.status if response else None}'
        page.wait_for_selector('html[data-status="pass"]', timeout=60_000)
        page.wait_for_selector('button[data-active-key^="region:"]', timeout=60_000)

        before = page.evaluate("""() => {
          const editor = window.semanticMapSite?.editor;
          if (!editor) return null;
          const snapshot = editor.snapshot();
          const domainIds = snapshot.domain.regions.map(item => item.id);
          const marks = (editor.adapter.lastScene?.representations ?? [])
            .filter(item => item.visual?.chartType)
            .map(item => ({
              regionId: item.regionId,
              sourceRegionId: item.sourceRegionId,
              readOnly: item.readOnly,
              labelEditable: item.labelEditable,
              chartType: item.visual.chartType,
            }));
          const activeIds = [...document.querySelectorAll('button[data-active-key^="region:"]')]
            .map(button => button.dataset.activeKey.slice('region:'.length));
          return { snapshot, domainIds, marks, activeIds };
        }""")
        assert before is not None, f'{variant}: semanticMapSite editor missing'
        domain_ids = set(before['domainIds'])
        marks = before['marks']
        active_ids = before['activeIds']
        assert marks, f'{variant}: no Chart marks'
        assert all(mark['readOnly'] is False for mark in marks), f'{variant}: read-only Chart mark remains'
        assert all(mark['labelEditable'] is True for mark in marks), f'{variant}: non-editable Chart mark remains'
        assert all(mark['sourceRegionId'] in domain_ids for mark in marks), (
            f'{variant}: projected mark lacks canonical domain source id'
        )
        assert active_ids, f'{variant}: active-list has no region items'
        assert len(active_ids) == len(set(active_ids)), f'{variant}: duplicate active-list domain ids'
        assert all(region_id in domain_ids for region_id in active_ids), (
            f'{variant}: active-list exposes synthetic/non-domain id'
        )

        button = page.locator('button[data-active-key^="region:"]').first
        active_key = button.get_attribute('data-active-key')
        assert active_key and active_key.startswith('region:'), f'{variant}: invalid active key {active_key}'
        region_id = active_key[len('region:'):]
        original_label = domain_label(page, region_id)
        assert original_label, f'{variant}: selected domain label missing for {region_id}'

        button.click()
        page.wait_for_function(
            """regionId => window.semanticMapSite.editor.snapshot().selection.regionIds.includes(regionId)""",
            arg=region_id,
            timeout=10_000,
        )
        selected = page.evaluate("""() => window.semanticMapSite.editor.snapshot().selection.regionIds""")
        assert selected == [region_id], f'{variant}: active-list selection did not resolve to canonical id: {selected}'

        started = page.evaluate("""() => window.semanticMapSite.editor.adapter.startEditingSelection()""")
        assert started is True, f'{variant}: inline editing did not start'
        inline = page.locator('.mxCellEditor[contenteditable="true"]')
        inline.wait_for(state='visible', timeout=10_000)
        proof_label = f'__chart_authoring_proof__{variant}__'
        inline.fill(proof_label)
        inline.press('Enter')

        page.wait_for_function(
            """args => window.semanticMapSite.editor.snapshot().domain.regions.find(item => item.id === args[0])?.label === args[1]""",
            arg=[region_id, proof_label],
            timeout=10_000,
        )
        page.wait_for_function(
            """args => document.querySelector(`button[data-active-key="${args[0]}"]`)?.textContent.includes(args[1])""",
            arg=[active_key, proof_label],
            timeout=10_000,
        )
        assert domain_label(page, region_id) == proof_label, f'{variant}: domain rename was not committed'

        page.evaluate("""() => document.activeElement?.blur()""")
        page.keyboard.press('Control+z')
        page.wait_for_function(
            """args => window.semanticMapSite.editor.snapshot().domain.regions.find(item => item.id === args[0])?.label === args[1]""",
            arg=[region_id, original_label],
            timeout=10_000,
        )
        page.wait_for_function(
            """args => document.querySelector(`button[data-active-key="${args[0]}"]`)?.textContent.includes(args[1])""",
            arg=[active_key, original_label],
            timeout=10_000,
        )

        page.keyboard.press('Control+y')
        page.wait_for_function(
            """args => window.semanticMapSite.editor.snapshot().domain.regions.find(item => item.id === args[0])?.label === args[1]""",
            arg=[region_id, proof_label],
            timeout=10_000,
        )
        page.wait_for_function(
            """args => document.querySelector(`button[data-active-key="${args[0]}"]`)?.textContent.includes(args[1])""",
            arg=[active_key, proof_label],
            timeout=10_000,
        )

        page.keyboard.press('Control+z')
        page.wait_for_function(
            """args => window.semanticMapSite.editor.snapshot().domain.regions.find(item => item.id === args[0])?.label === args[1]""",
            arg=[region_id, original_label],
            timeout=10_000,
        )
        page.wait_for_function(
            """args => document.querySelector(`button[data-active-key="${args[0]}"]`)?.textContent.includes(args[1])""",
            arg=[active_key, original_label],
            timeout=10_000,
        )

        after = page.evaluate("""regionId => {
          const editor = window.semanticMapSite.editor;
          const snapshot = editor.snapshot();
          const projection = (editor.adapter.lastScene?.representations ?? [])
            .filter(item => item.sourceRegionId === regionId && item.visual?.chartType)
            .map(item => ({ regionId: item.regionId, sourceRegionId: item.sourceRegionId, readOnly: item.readOnly }));
          const active = editor.adapter.activeList.snapshot();
          return { snapshot, projection, active };
        }""", region_id)
        assert after['projection'], f'{variant}: edited source region disappeared from projection'
        assert all(
            item['sourceRegionId'] == region_id and item['readOnly'] is False
            for item in after['projection']
        ), f'{variant}: post-edit source/projection mapping invalid'
        restored = next(item for item in after['snapshot']['domain']['regions'] if item['id'] == region_id)
        assert restored['label'] == original_label, f'{variant}: final state not restored'
        assert not events['pageErrors'], f"{variant}: page errors {events['pageErrors']}"
        assert not events['requestFailed'], f"{variant}: request failures {events['requestFailed']}"

        screenshot = out / f'{variant}.png'
        page.screenshot(path=str(screenshot), full_page=True)
        receipt = {
            'variant': variant,
            'url': url,
            'httpStatus': response.status,
            'featureStatus': page.locator('html').get_attribute('data-status'),
            'selectedDomainId': region_id,
            'projectionIds': [item['regionId'] for item in after['projection']],
            'canonicalSourceIdentity': True,
            'allChartMarksAuthorable': True,
            'activeListCanonicalIds': True,
            'activeListClickSelection': True,
            'inlineRename': True,
            'rerenderAfterRename': True,
            'undo': True,
            'redo': True,
            'restoredOriginalState': True,
            'pageErrors': events['pageErrors'],
            'requestFailed': events['requestFailed'],
            'screenshot': screenshot.name,
        }
        receipts.append(receipt)
        print(json.dumps(receipt, ensure_ascii=False))
        page.close()
    browser.close()

final = {
    'schema': 'ui.chart-deployed-authoring-proof/1',
    'status': 'PASS',
    'sourceSha': os.environ['SOURCE_SHA'],
    'immutableDeployment': os.environ['IMMUTABLE_DEPLOYMENT'],
    'stableAlias': 'https://ui-deploy-pr-224.stg-artifact-runtime.pages.dev',
    'variants': receipts,
}
(out / 'receipt.json').write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(final, ensure_ascii=False))
