from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright


async def run(base_url: str, output: Path, chromium: str) -> None:
    output.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {"status": "pass", "baseUrl": base_url, "checks": {}}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=chromium, headless=True, args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
        response = await page.goto(base_url, wait_until="networkidle")
        await page.wait_for_function("window.__purposeAtlas != null")
        report["checks"]["httpStatus"] = response.status if response else None
        report["checks"]["surface"] = await page.locator("purpose-atlas-shell").count() == 1
        report["checks"]["canvas"] = await page.locator("purpose-atlas-canvas canvas").count() == 1

        next_button = page.locator('button[data-action="next"]')
        await next_button.click()
        await page.wait_for_timeout(70)
        await next_button.click()
        await page.wait_for_timeout(100)
        state = await page.evaluate("window.__purposeAtlas.getState()")
        report["checks"]["nextAction"] = state["ui"]["step"] == 2 and state["atlas"]["currentPurpose"] == "法人売却"

        await page.locator('button[data-mode="responsibility"]').click()
        await page.wait_for_timeout(100)
        points = await page.evaluate("""() => {
          const app = document.querySelector('purpose-atlas-app');
          const surface = app.shadowRoot.querySelector('a2ui-surface');
          const shell = surface.shadowRoot.querySelector('purpose-atlas-shell');
          const canvas = shell.shadowRoot.querySelector('purpose-atlas-canvas');
          return canvas.getRingTestPoints();
        }""")
        canvas_box = await page.locator("purpose-atlas-canvas canvas").bounding_box()
        if points and canvas_box:
            point = points[0]
            await page.mouse.click(canvas_box["x"] + point["x"], canvas_box["y"] + point["y"])
            await page.wait_for_timeout(100)
        state = await page.evaluate("window.__purposeAtlas.getState()")
        report["checks"]["ringSelection"] = state["ui"]["selection"] is not None and state["inspector"]["details"]["type"] == "responsibility"

        record = page.locator('button[data-action="record-mismatch"]')
        await record.click()
        await page.wait_for_timeout(70)
        await record.click()
        await page.wait_for_timeout(100)
        state = await page.evaluate("window.__purposeAtlas.getState()")
        report["checks"]["operationDedupe"] = len(state["operations"]) == 1

        slider = page.locator('input[data-action="timeline"]')
        await slider.evaluate("el => { el.value = '39'; el.dispatchEvent(new Event('input', {bubbles:true, composed:true})); }")
        await page.wait_for_timeout(180)
        state = await page.evaluate("window.__purposeAtlas.getState()")
        report["checks"]["purposeTransition"] = state["atlas"]["currentPurpose"] == "幸せな老後" and state["atlas"]["guard"]["status"] == "ok"
        await page.wait_for_timeout(1900)
        await page.screenshot(path=str(output / "desktop-t39.png"), full_page=True)

        mobile = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile_errors: list[str] = []
        mobile.on("pageerror", lambda error: mobile_errors.append(f"pageerror: {error}"))
        mobile.on("console", lambda message: mobile_errors.append(f"console: {message.text}") if message.type == "error" else None)
        await mobile.goto(base_url, wait_until="networkidle")
        await mobile.wait_for_function("window.__purposeAtlas != null")
        mobile_slider = mobile.locator('input[data-action="timeline"]')
        await mobile_slider.evaluate("el => { el.value = '20'; el.dispatchEvent(new Event('input', {bubbles:true, composed:true})); }")
        await mobile.wait_for_timeout(160)
        await mobile.locator('button[data-mode="risk"]').click()
        await mobile.wait_for_timeout(1900)
        mobile_state = await mobile.evaluate("window.__purposeAtlas.getState()")
        report["checks"]["mobileProjection"] = mobile_state["ui"]["step"] == 20 and mobile_state["atlas"]["currentPurpose"] == "衛星軌道投入"
        await mobile.screenshot(path=str(output / "mobile-t20.png"), full_page=True)

        report["consoleErrors"] = errors + mobile_errors
        if report["consoleErrors"] or not all(bool(value) for value in report["checks"].values()):
            report["status"] = "fail"
        await browser.close()

    (output / "browser-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))
    if report["status"] != "pass":
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4173/")
    parser.add_argument("--output", type=Path, default=Path("evidence"))
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    asyncio.run(run(args.url, args.output, args.chromium))


if __name__ == "__main__":
    main()
