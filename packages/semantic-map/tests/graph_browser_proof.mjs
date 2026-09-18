import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [urlsPath, screenshotDir] = process.argv.slice(2);
if (!urlsPath || !screenshotDir) {
  throw new Error('graph-browser-proof: expected <proof-urls.json> <screenshot-dir>');
}
const urls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
for (const name of ['self', 'mimic', 'adr344']) {
  if (typeof urls[name] !== 'string' || !urls[name]) throw new Error(`graph-browser-proof: missing URL ${name}`);
}
fs.mkdirSync(screenshotDir, { recursive: true });

const proof = String.raw`
import json
import os
import sys
from playwright.sync_api import sync_playwright

urls_path, screenshot_dir = sys.argv[1], sys.argv[2]
with open(urls_path, encoding='utf-8') as handle:
    urls = json.load(handle)

expected = {
    'self': ['Claim', 'role: proposal | decision'],
    'mimic': [
        '見えるんです', 'UI / Graph', 'AWS | Amazon S3', 'input.json', 'output.json', 'mieru-dev',
        '既存画面データ対応', '1 object / join不要 / 契約は統合', 'writes output.json', 'reads result',
    ],
    'adr344': [
        'Meaning authority', 'Progressive phase values', 'Explicit non-green results',
        'Fact', 'Condition', 'Claim', 'ProjectionResult', 'CandidateData', 'ReadyData',
        'AdmittedData', 'EffectResult', 'ObservedData', 'FindingData', 'Missing',
        'AdmissionFailure', 'ExplicitUnknown',
    ],
}

def visible_box(page, token):
    locator = page.get_by_text(token, exact=False).first
    locator.wait_for(state='visible', timeout=30000)
    box = locator.bounding_box()
    assert box and box['width'] > 0 and box['height'] > 0, '%s: no visible box' % token
    return box

results = {}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for name, url in urls.items():
        if name not in expected:
            continue
        page_errors = []
        console_errors = []
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        page.on('pageerror', lambda error, bag=page_errors: bag.append(str(error)))
        page.on('console', lambda message, bag=console_errors: bag.append(message.text) if message.type == 'error' else None)
        response = page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_selector('[data-status="pass"]', timeout=60000)
        page.wait_for_selector('svg', state='visible', timeout=60000)
        body = page.locator('body').inner_text()
        assert 'BLOCKED' not in body, '%s: BLOCKED: %s' % (name, body[:500])
        for token in expected[name]:
            assert token in body, '%s: missing %r' % (name, token)
        assert response and response.status == 200, '%s: HTTP failure' % name
        assert not page_errors, '%s: page errors %r' % (name, page_errors)
        assert not console_errors, '%s: console errors %r' % (name, console_errors)
        svg = page.locator('svg').first.bounding_box()
        assert svg and svg['width'] > 0 and svg['height'] > 0, '%s: empty SVG' % name

        if name == 'self':
            path_boxes = []
            paths = page.locator('svg path')
            for index in range(paths.count()):
                box = paths.nth(index).bounding_box()
                if box:
                    path_boxes.append(box)
            loops = [box for box in path_boxes if box['width'] > 40 and box['height'] > 30]
            assert loops, 'self: no visibly looping edge geometry: %r' % path_boxes

        if name == 'mimic':
            ui = visible_box(page, 'UI / Graph')
            s3 = visible_box(page, 'AWS | Amazon S3')
            dev = visible_box(page, 'mieru-dev')
            assert ui['x'] < s3['x'] < dev['x'], 'mimic: three-column order lost'
            request = visible_box(page, '松本さん側')
            result = visible_box(page, '既存画面データ対応')
            assert request['y'] < result['y'], 'mimic: request/result vertical order lost'
            for token in ['input.json', 'output.json', '処理', '意味を持たない', '1 object / join不要 / 契約は統合']:
                visible_box(page, token)

        if name == 'adr344':
            for token in ['Meaning authority', 'Progressive phase values', 'Explicit non-green results']:
                visible_box(page, token)

        screenshot = os.path.join(screenshot_dir, name + '.png')
        page.screenshot(path=screenshot, full_page=True)
        results[name] = {
            'http': response.status,
            'svg': [round(svg['width']), round(svg['height'])],
            'pageErrors': len(page_errors),
            'consoleErrors': len(console_errors),
            'status': 'PASS',
        }
        page.close()
    browser.close()

assert set(results) == {'self', 'mimic', 'adr344'}, 'incomplete proof results: %r' % sorted(results)
print(json.dumps({'schema': 'semantic-map-graph-browser-proof/1', 'status': 'PASS', 'results': results}, ensure_ascii=False))
`;

const run = spawnSync('python3', ['-', path.resolve(urlsPath), path.resolve(screenshotDir)], {
  encoding: 'utf8',
  input: proof,
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);
