from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
DESIGN = ROOT / "examples" / "control" / "design.json"
CONTROL = ROOT / "examples" / "control" / "control.jsonl"
CLAIMS = ROOT / "examples" / "control" / "claims.jsonl"
CHROMIUM = os.environ.get("CHROMIUM_EXECUTABLE")
EXPECTED_ROWS = 129
EXPECTED_REPORTS = 97


def port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    value = sock.getsockname()[1]
    sock.close()
    return value


def build_preview(output: Path) -> None:
    completed = subprocess.run(
        ["npm", "--prefix", "apps/preview", "run", "build", "--", f"--outDir={output}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout


def encoded_hash(include_claims: bool) -> str:
    code = """
import fs from 'node:fs/promises';
import { createUrlModuleUrl } from './packages/url-module/src/index.mjs';
const design = JSON.parse(await fs.readFile(process.argv[1], 'utf8'));
const control = await fs.readFile(process.argv[2], 'utf8');
const claims = await fs.readFile(process.argv[3], 'utf8');
const value = process.argv[4] === 'yes' ? { design, control, claims } : { design, control };
const href = await createUrlModuleUrl({ base: 'https://control.invalid/?case=control', fragment: 'data', value });
process.stdout.write(new URL(href).hash);
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code, str(DESIGN), str(CONTROL), str(CLAIMS), "yes" if include_claims else "no"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    fragment = result.stdout.strip()
    assert fragment.startswith("#data="), fragment
    return fragment


def wait_for_proof(page: Page, label: str) -> dict[str, object]:
    deadline = time.monotonic() + 30
    last = None
    while time.monotonic() < deadline:
        last = page.evaluate("() => globalThis.uiPreviewProof ?? null")
        if isinstance(last, dict) and last.get("status") in {"PASS", "FAIL"}:
            assert last["status"] == "PASS", f"{label}: {last}"
            return last
        time.sleep(0.05)
    raise AssertionError(f"{label}: preview proof did not settle: {last!r}")


def prove_grid(page: Page, expected_reports: int, expected_meta: str, require_evidence: bool) -> dict[str, int]:
    assert page.locator("[data-a2ui-component='TreeGrid']").count() == 1
    assert page.locator("[data-a2ui-component='Tree']").count() == 0
    rows = page.locator("[data-control-row]")
    assert rows.count() == EXPECTED_ROWS
    mismatch = page.eval_on_selector_all(
        "[data-control-row]",
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
    assert reports == expected_reports, reports
    assert missing == EXPECTED_ROWS - expected_reports, missing
    assert page.locator(".grid-head [data-control-column='claims'] .grid-meta").inner_text() == expected_meta

    if require_evidence:
        evidence = page.locator("[data-control-row='policy'] > [data-control-column='claims'] .property[data-key='evidence'][data-rest='true']")
        assert evidence.count() == 1
        assert 'AGENTS.zip' in evidence.inner_text()

    toggle = page.locator("[data-control-row='ui'] [data-control-toggle='details']")
    assert toggle.count() == 1
    toggle.click()
    branch = page.locator("[data-control-id='ui'] > [data-control-relation='details']")
    assert branch.count() == 1
    assert branch.is_hidden()

    overflows = page.eval_on_selector_all(
        ".tree-grid,.children,.grid-cell",
        "els => els.map(el => getComputedStyle(el).overflowY)",
    )
    assert all(value not in ("auto", "scroll") for value in overflows)
    return {"rows": EXPECTED_ROWS, "reports": reports, "missing": missing, "aligned": EXPECTED_ROWS}


def main() -> None:
    errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ui-preview-control-") as temp:
        output = Path(temp) / "dist"
        build_preview(output)
        listen = port()
        server = subprocess.Popen(
            ["python3", "-m", "http.server", str(listen), "--bind", "127.0.0.1"],
            cwd=output,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        base = f"http://127.0.0.1:{listen}"
        try:
            time.sleep(0.4)
            with sync_playwright() as playwright:
                launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
                if CHROMIUM:
                    launch["executable_path"] = CHROMIUM
                browser = playwright.chromium.launch(**launch)
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.on("pageerror", lambda error: errors.append(str(error)))

                page.goto(f"{base}/?case=control{encoded_hash(True)}", wait_until="domcontentloaded", timeout=30_000)
                wait_for_proof(page, "with claims")
                with_claims = prove_grid(page, EXPECTED_REPORTS, "D reports · 97 / 129 reported", True)

                page.goto(f"{base}/?case=control&proof=without-claims{encoded_hash(False)}", wait_until="domcontentloaded", timeout=30_000)
                wait_for_proof(page, "without claims")
                without_claims = prove_grid(page, 0, "D reports · not provided", False)

                assert errors == [], errors
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()

    print(json.dumps({
        "schema": "ui-preview-control-browser-proof/2",
        "status": "PASS",
        "projection": "TreeGrid",
        "withClaims": with_claims,
        "withoutClaims": without_claims,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
