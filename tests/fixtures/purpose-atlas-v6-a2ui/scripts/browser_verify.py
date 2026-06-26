from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, Page, async_playwright

from witness_lib import ROOT, candidate_html


async def state(page: Page) -> dict[str, Any]:
    return await page.evaluate("window.__purposeAtlas.getUiState()")


async def wait_t(page: Page, value: int) -> None:
    await page.wait_for_function(
        "expected => window.__purposeAtlas?.getUiState?.()?.t === expected",
        arg=value,
    )


async def click(page: Page, selector: str, pause: int = 80) -> None:
    await page.locator(selector).click()
    await page.wait_for_timeout(pause)


async def set_t(page: Page, value: int) -> None:
    await click(page, f'.tick[data-t="{value}"]', 100)
    await wait_t(page, value)


async def run_case(
    browser: Browser,
    html: str,
    name: str,
    viewport: dict[str, int],
    mobile: bool,
    output: Path,
) -> dict[str, Any]:
    context = await browser.new_context(
        viewport=viewport,
        device_scale_factor=2 if mobile else 1,
        is_mobile=mobile,
        has_touch=mobile,
        reduced_motion="reduce",
    )
    page = await context.new_page()
    page.set_default_timeout(7000)
    errors: list[str] = []
    page.on("console", lambda message: errors.append(f"console:{message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"page:{error}"))

    await page.set_content(html, wait_until="load")
    await page.wait_for_function("window.__purposeAtlas?.getUiState?.() != null")
    await wait_t(page, 7)
    await page.wait_for_timeout(450)

    initial = await state(page)
    architecture = {
        "app": await page.locator("purpose-atlas-app").count(),
        "root": await page.locator("purpose-atlas-source-surface").count(),
        "canvases": await page.locator("purpose-atlas-source-surface canvas").count(),
        "clientDataModel": await page.evaluate("Boolean(window.__purposeAtlas.getClientDataModel())"),
        "surfaceId": await page.evaluate("window.__purposeAtlas.runtime.surface?.id || null"),
    }

    await click(page, 'button[data-action="next"]')
    await wait_t(page, 8)
    after_next = await state(page)
    next_action = await page.evaluate("window.__purposeAtlas.getState().runtime.lastAction?.name || null")

    await set_t(page, 20)
    t20 = await state(page)

    canvas_box = await page.locator("#atlasOverlay").bounding_box()
    if not canvas_box:
        raise RuntimeError("atlas overlay has no bounding box")

    before_hover = await state(page)
    if not mobile:
        for index in range(80):
            x = canvas_box["x"] + 20 + (index * 37) % max(40, int(canvas_box["width"] - 40))
            y = canvas_box["y"] + 30 + (index * 23) % max(50, int(canvas_box["height"] - 60))
            await page.mouse.move(x, y)
        await page.wait_for_timeout(250)
    after_hover = await state(page)

    chosen = None
    for point in t20.get("responsibilityTestPoints", []):
        if (
            canvas_box["x"] + 12 < point["x"] < canvas_box["x"] + canvas_box["width"] - 12
            and canvas_box["y"] + 12 < point["y"] < canvas_box["y"] + canvas_box["height"] - 12
        ):
            chosen = point
            break

    ring: dict[str, Any] = {
        "point": chosen,
        "tip": False,
        "focus": None,
        "selection": None,
        "operationsAfterDuplicate": None,
    }
    if chosen:
        await page.mouse.click(chosen["x"], chosen["y"])
        await page.wait_for_timeout(180)
        selected = await state(page)
        ring.update(
            tip=selected["tipVisible"],
            focus=selected["focusType"],
            selection=await page.evaluate("window.__purposeAtlas.getState().ui.selection"),
        )
        record = page.locator('button[data-action="record-mismatch"]')
        if await record.count():
            await record.click()
            await page.wait_for_timeout(90)
            await record.click()
            await page.wait_for_timeout(120)
            ring["operationsAfterDuplicate"] = (await state(page))["totalOpsRecorded"]

    await page.screenshot(path=str(output / f"browser.{name}.t20-selected.png"), full_page=True, animations="disabled")

    await set_t(page, 39)
    t39 = await state(page)
    await set_t(page, 40)
    final = await state(page)

    zoom0 = final["zoom"]
    await click(page, 'button[data-action="zoom-in"]')
    zoom1 = (await state(page))["zoom"]
    await click(page, 'button[data-action="zoom-out"]')
    zoom2 = (await state(page))["zoom"]

    checks = {
        "noConsoleErrors": not errors,
        "a2uiSurfaceCreated": architecture == {
            "app": 1,
            "root": 1,
            "canvases": 2,
            "clientDataModel": True,
            "surfaceId": "purpose-atlas",
        },
        "sourceUiInitialProjection": initial["t"] == 7
        and initial["currentPurpose"] == "衛星軌道投入"
        and initial["viewMode"] == "responsibility"
        and initial["roleNodeCount"] == 0,
        "a2uiNextAction": after_next["t"] == 8 and next_action == "atlas.next",
        "responsibilityProjection": len(t20["responsibilityComposition"]) >= 3,
        "hoverDoesNotRebuildScene": after_hover["render"]["sceneBuilds"] == before_hover["render"]["sceneBuilds"],
        "responsibilityRingSelection": ring["tip"]
        and ring["focus"] == "responsibility"
        and ring["selection"] is not None
        and ring["selection"].get("type") == "responsibility",
        "operationDedupe": ring["operationsAfterDuplicate"] == 1,
        "purposeTransition": t39["currentPurpose"] == "幸せな老後" and t39["guard"] == "ok",
        "finalEvent": final["t"] == 40 and final["lastEvent"] == "cxo.activity",
        "zoomRoundTrip": zoom1 > zoom0 and zoom2 < zoom1 and abs(zoom2 - zoom0) < 1e-9,
        "mobileInspectorPolicy": (not mobile) or (ring["tip"] and ring["selection"] is not None),
    }

    result = {
        "pass": all(checks.values()),
        "checks": checks,
        "errors": errors,
        "architecture": architecture,
        "initial": initial,
        "t20": t20,
        "ring": ring,
        "t39": t39,
        "final": final,
        "zoom": [zoom0, zoom1, zoom2],
        "hover": {
            "sceneBuildsBefore": before_hover["render"]["sceneBuilds"],
            "sceneBuildsAfter": after_hover["render"]["sceneBuilds"],
            "overlayFramesBefore": before_hover["render"]["overlayFrames"],
            "overlayFramesAfter": after_hover["render"]["overlayFrames"],
            "hoverChanges": after_hover["render"]["hoverChanges"],
        },
    }
    await context.close()
    return result


async def run(output: Path, chromium: str) -> None:
    output.mkdir(parents=True, exist_ok=True)
    html = candidate_html(ROOT)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=chromium,
            headless=True,
            args=["--no-sandbox", "--disable-gpu"],
        )
        results = {
            "desktop": await run_case(browser, html, "desktop", {"width": 1440, "height": 1050}, False, output),
            "mobile": await run_case(browser, html, "mobile", {"width": 390, "height": 844}, True, output),
        }
        await browser.close()

    report = {
        "status": "pass" if all(result["pass"] for result in results.values()) else "fail",
        "candidate": "dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html",
        "results": results,
    }
    (output / "browser-verification.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "status": report["status"],
        "desktop": results["desktop"]["checks"],
        "mobile": results["mobile"]["checks"],
    }, ensure_ascii=False))
    if report["status"] != "pass":
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "evidence")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    asyncio.run(run(args.output, args.chromium))


if __name__ == "__main__":
    main()
