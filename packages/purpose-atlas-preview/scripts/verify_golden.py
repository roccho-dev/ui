from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageOps
from playwright.async_api import Browser, Page, async_playwright
from skimage.metrics import structural_similarity

from witness_lib import (
    ROOT,
    candidate_html,
    canonical_json,
    round_box,
    semantic_projection,
    sha256_json,
    source_golden_html,
)

SELECTORS = (
    ".app",
    ".topbar",
    ".purpose-card",
    ".commandbar",
    ".workspace",
    ".stage",
    ".inspector",
    ".timeline",
    "#currentPurpose",
    "#statusBadge",
    "#decisionCopy",
    "#eventProgress",
    "#nextOwner",
    "#lastEvent",
    "#modeCopy",
    "#renderState",
    "#railSummary",
)


async def debug_state(page: Page, candidate: bool) -> dict[str, Any]:
    expression = "window.__purposeAtlas.getUiState()" if candidate else "window.__uxState()"
    return await page.evaluate(expression)


async def wait_ready(page: Page, candidate: bool) -> None:
    expression = (
        "window.__purposeAtlas?.getUiState?.() != null"
        if candidate
        else "window.__uxState != null"
    )
    await page.wait_for_function(expression)
    await page.wait_for_function(
        "candidate => { const s = candidate ? window.__purposeAtlas.getUiState() : window.__uxState(); return s.t === 7 && s.render.sceneBuilds >= 1; }",
        arg=candidate,
    )


async def set_t(page: Page, value: int, candidate: bool) -> None:
    if value == 0:
        selector = 'button[data-action="reset"]' if candidate else "#resetBtn"
    else:
        selector = f'.tick[data-t="{value}"]'
    await page.locator(selector).evaluate("element => element.click()")
    await page.wait_for_function(
        "args => { const s = args.candidate ? window.__purposeAtlas.getUiState() : window.__uxState(); return s.t === args.value; }",
        arg={"candidate": candidate, "value": value},
    )
    await page.wait_for_timeout(5)


async def collect_geometry(page: Page) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for selector in SELECTORS:
        locator = page.locator(selector).first
        if await locator.count() != 1:
            output[selector] = {"missing": True}
            continue
        output[selector] = {
            "box": round_box(await locator.bounding_box()),
            "text": (await locator.inner_text()).strip(),
        }
    return output


async def new_page(
    browser: Browser,
    html: str,
    viewport: dict[str, int],
    mobile: bool,
    dpr: int,
    candidate: bool,
) -> tuple[Any, Page, list[str]]:
    context = await browser.new_context(
        viewport=viewport,
        device_scale_factor=dpr,
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
    await wait_ready(page, candidate)
    return context, page, errors


async def semantic_witness(browser: Browser, golden_html: str, candidate_markup: str) -> dict[str, Any]:
    golden_context, golden_page, golden_errors = await new_page(
        browser, golden_html, {"width": 1440, "height": 1050}, False, 1, False,
    )
    candidate_context, candidate_page, candidate_errors = await new_page(
        browser, candidate_markup, {"width": 1440, "height": 1050}, False, 1, True,
    )

    rows: list[dict[str, Any]] = []
    mismatches: list[dict[str, Any]] = []
    for step in range(41):
        await set_t(golden_page, step, False)
        await set_t(candidate_page, step, True)
        golden = semantic_projection(await debug_state(golden_page, False))
        candidate = semantic_projection(await debug_state(candidate_page, True))
        golden_hash = sha256_json(golden)
        candidate_hash = sha256_json(candidate)
        equal = golden == candidate
        row = {
            "t": step,
            "equal": equal,
            "goldenSha256": golden_hash,
            "candidateSha256": candidate_hash,
            "projection": golden,
        }
        rows.append(row)
        if not equal:
            mismatches.append({
                "t": step,
                "golden": golden,
                "candidate": candidate,
            })

    await golden_context.close()
    await candidate_context.close()
    combined_hash = sha256_json([row["projection"] for row in rows])
    return {
        "pass": not mismatches and not golden_errors and not candidate_errors,
        "requirement": "exact canonical equality",
        "stepsCompared": len(rows),
        "fieldsPerStep": len(rows[0]["projection"]) if rows else 0,
        "combinedProjectionSha256": combined_hash,
        "mismatches": mismatches,
        "goldenErrors": golden_errors,
        "candidateErrors": candidate_errors,
        "rows": rows,
    }


async def capture_visual(
    browser: Browser,
    html: str,
    candidate: bool,
    viewport: dict[str, int],
    mobile: bool,
    dpr: int,
    path: Path,
) -> dict[str, Any]:
    context, page, errors = await new_page(browser, html, viewport, mobile, dpr, candidate)
    await page.wait_for_timeout(700)
    state = await debug_state(page, candidate)
    geometry = await collect_geometry(page)
    await page.screenshot(path=str(path), full_page=True, animations="disabled")
    await context.close()
    return {"errors": errors, "state": semantic_projection(state), "geometry": geometry}


def image_metrics(golden_path: Path, candidate_path: Path, diff_path: Path) -> dict[str, Any]:
    golden_image = Image.open(golden_path).convert("RGB")
    candidate_image = Image.open(candidate_path).convert("RGB")
    if golden_image.size != candidate_image.size:
        return {
            "sameSize": False,
            "goldenSize": list(golden_image.size),
            "candidateSize": list(candidate_image.size),
        }

    golden = np.asarray(golden_image, dtype=np.float32)
    candidate = np.asarray(candidate_image, dtype=np.float32)
    absolute = np.abs(golden - candidate)
    pixel_max = absolute.max(axis=2)
    ssim = float(structural_similarity(
        golden.astype(np.uint8),
        candidate.astype(np.uint8),
        channel_axis=2,
        data_range=255,
    ))

    raw_diff = ImageChops.difference(golden_image, candidate_image)
    visible_diff = ImageEnhance.Brightness(ImageOps.autocontrast(raw_diff)).enhance(2.5)
    visible_diff.save(diff_path)

    return {
        "sameSize": True,
        "size": list(golden_image.size),
        "ssim": ssim,
        "mae": float(absolute.mean()),
        "rmse": float(np.sqrt(np.mean((golden - candidate) ** 2))),
        "exactPixelRatio": float(np.mean(pixel_max == 0)),
        "pixelsWithin5Ratio": float(np.mean(pixel_max <= 5)),
        "pixelsWithin15Ratio": float(np.mean(pixel_max <= 15)),
        "pixelsWithin30Ratio": float(np.mean(pixel_max <= 30)),
        "maxChannelDifference": float(absolute.max()),
    }


def geometry_metrics(golden: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    mismatches: list[dict[str, Any]] = []
    maximum_delta = 0.0
    text_equal = True
    for selector in SELECTORS:
        first = golden.get(selector, {})
        second = candidate.get(selector, {})
        if first.get("missing") or second.get("missing"):
            mismatches.append({"selector": selector, "reason": "missing", "golden": first, "candidate": second})
            continue
        if first.get("text") != second.get("text"):
            text_equal = False
            mismatches.append({
                "selector": selector,
                "reason": "text",
                "golden": first.get("text"),
                "candidate": second.get("text"),
            })
        first_box = first.get("box") or {}
        second_box = second.get("box") or {}
        deltas = {key: abs(float(first_box.get(key, 0)) - float(second_box.get(key, 0))) for key in ("x", "y", "width", "height")}
        selector_max = max(deltas.values(), default=0.0)
        maximum_delta = max(maximum_delta, selector_max)
        if selector_max > 0.1:
            mismatches.append({"selector": selector, "reason": "geometry", "deltas": deltas})
    return {
        "textExact": text_equal,
        "maximumBoxDeltaPx": round(maximum_delta, 3),
        "selectorsCompared": len(SELECTORS),
        "mismatches": mismatches,
    }


def verify_source_lock(root: Path) -> dict[str, Any]:
    lock = json.loads((root / "golden" / "GOLDEN_LOCK.json").read_text(encoding="utf-8"))
    actual: dict[str, str] = {}
    mismatches: list[dict[str, str]] = []
    for name, expected in lock["sourceFilesSha256"].items():
        path = root / "golden" / "source" / name
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        actual[name] = digest
        if digest != expected:
            mismatches.append({"file": name, "expected": expected, "actual": digest})
    return {
        "pass": not mismatches,
        "goldenId": lock["goldenId"],
        "uiSource": lock["uiSource"],
        "sourceForm": lock["sourceForm"],
        "files": actual,
        "mismatches": mismatches,
        "policy": lock,
    }


async def run(output: Path, chromium: str) -> None:
    output.mkdir(parents=True, exist_ok=True)
    golden_markup = source_golden_html(ROOT)
    candidate_markup = candidate_html(ROOT)
    source_integrity = verify_source_lock(ROOT)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=chromium,
            headless=True,
            args=["--no-sandbox", "--disable-gpu"],
        )
        semantic = await semantic_witness(browser, golden_markup, candidate_markup)
        visual_inputs: dict[str, Any] = {}
        cases = {
            "desktop": ({"width": 1440, "height": 1050}, False, 1),
            "mobile": ({"width": 390, "height": 844}, True, 2),
        }
        for name, (viewport, mobile, dpr) in cases.items():
            golden_path = output / f"golden.{name}.t7.png"
            candidate_path = output / f"candidate.{name}.t7.png"
            visual_inputs[name] = {
                "golden": await capture_visual(browser, golden_markup, False, viewport, mobile, dpr, golden_path),
                "candidate": await capture_visual(browser, candidate_markup, True, viewport, mobile, dpr, candidate_path),
                "goldenPath": golden_path,
                "candidatePath": candidate_path,
                "diffPath": output / f"diff.{name}.t7.png",
            }
        await browser.close()

    visual: dict[str, Any] = {}
    policy = source_integrity["policy"]["visualWitness"]["thresholds"]
    for name, item in visual_inputs.items():
        metrics = image_metrics(item["goldenPath"], item["candidatePath"], item["diffPath"])
        geometry = geometry_metrics(item["golden"]["geometry"], item["candidate"]["geometry"])
        checks = {
            "noBrowserErrors": not item["golden"]["errors"] and not item["candidate"]["errors"],
            "sameSemanticState": item["golden"]["state"] == item["candidate"]["state"],
            "sameImageSize": bool(metrics.get("sameSize")),
            "ssimThreshold": float(metrics.get("ssim", 0)) >= float(policy["globalSsimMin"]),
            "pixelAgreementThreshold": float(metrics.get("pixelsWithin15Ratio", 0)) >= float(policy["pixelsWithin15Min"]),
            "textExact": geometry["textExact"],
            "geometryThreshold": geometry["maximumBoxDeltaPx"] <= float(policy["geometryMaxDeltaPx"]),
        }
        visual[name] = {
            "pass": all(checks.values()),
            "checks": checks,
            "metrics": metrics,
            "geometry": geometry,
            "goldenErrors": item["golden"]["errors"],
            "candidateErrors": item["candidate"]["errors"],
            "files": {
                "golden": item["goldenPath"].name,
                "candidate": item["candidatePath"].name,
                "diff": item["diffPath"].name,
            },
        }

    semantic_rows_path = output / "semantic-projections.json"
    semantic_rows_path.write_text(
        json.dumps({
            "status": "pass" if semantic["pass"] else "fail",
            "requirement": semantic["requirement"],
            "stepsCompared": semantic["stepsCompared"],
            "combinedProjectionSha256": semantic["combinedProjectionSha256"],
            "rows": semantic["rows"],
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    report = {
        "status": "pass" if source_integrity["pass"] and semantic["pass"] and all(case["pass"] for case in visual.values()) else "fail",
        "golden": {
            "id": source_integrity["goldenId"],
            "source": source_integrity["uiSource"],
            "form": source_integrity["sourceForm"],
            "integrity": {key: value for key, value in source_integrity.items() if key != "policy"},
        },
        "candidate": "dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html",
        "semantic": {key: value for key, value in semantic.items() if key != "rows"},
        "visual": visual,
        "policy": source_integrity["policy"],
    }
    report_path = output / "golden-witness.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    markdown = [
        "# Golden / Witness verification",
        "",
        f"- Status: **{report['status'].upper()}**",
        f"- Golden: `{report['golden']['source']}` ({report['golden']['form']})",
        f"- Candidate: `{report['candidate']}`",
        f"- Semantic projections: **{semantic['stepsCompared']}/41 exact**, hash `{semantic['combinedProjectionSha256']}`",
        "",
        "| viewport | SSIM | pixels Δ≤15 | max geometry delta | text | result |",
        "|---|---:|---:|---:|---|---|",
    ]
    for name, case in visual.items():
        markdown.append(
            f"| {name} | {case['metrics'].get('ssim', 0):.6f} | "
            f"{case['metrics'].get('pixelsWithin15Ratio', 0):.6%} | "
            f"{case['geometry']['maximumBoxDeltaPx']:.3f}px | "
            f"{'exact' if case['geometry']['textExact'] else 'different'} | "
            f"{'PASS' if case['pass'] else 'FAIL'} |"
        )
    markdown += [
        "",
        "The semantic witness compares the original latest source UI and the A2UI candidate at every timeline state t0–t40. Visual screenshots are freshly rendered from both implementations under the same browser, viewport, DPR, and reduced-motion settings.",
        "",
    ]
    (output / "golden-witness.md").write_text("\n".join(markdown), encoding="utf-8")

    print(json.dumps({
        "status": report["status"],
        "sourceIntegrity": source_integrity["pass"],
        "semanticStepsExact": semantic["stepsCompared"] if semantic["pass"] else 0,
        "semanticHash": semantic["combinedProjectionSha256"],
        "visual": {
            name: {
                "pass": case["pass"],
                "ssim": case["metrics"].get("ssim"),
                "pixelsWithin15": case["metrics"].get("pixelsWithin15Ratio"),
                "maxGeometryDeltaPx": case["geometry"]["maximumBoxDeltaPx"],
            }
            for name, case in visual.items()
        },
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
