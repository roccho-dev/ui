from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "ssg-hot-refresh-viewport"
BUILD_SCRIPT = ROOT / "packages" / "a2ui-adapter-artifacts" / "scripts" / "build-ssg-hot-refresh-proof.mjs"
DEFAULT_ARTIFACT = ROOT / "packages" / "a2ui-adapter-artifacts" / ".generated" / "ssg-hot-refresh-viewport-artifact"
TOLERANCE = 1e-9
WRANGLER_VERSION = "4.112.0"
DEFAULT_CADDY_VERSION = "v2.11.3"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", choices=("wrangler", "caddy"), default="wrangler")
    return parser.parse_args()


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_server(url: str, timeout_seconds: float = 60) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception as error:
            last_error = error
        time.sleep(0.25)
    raise RuntimeError(f"server did not become ready: {last_error}")


def wait_for_path(path: Path, timeout_seconds: float = 30) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if path.exists() and path.stat().st_size > 0:
            return
        time.sleep(0.1)
    raise RuntimeError(f"path did not become ready: {path}")


def viewport(page: Page) -> dict[str, float]:
    value = page.evaluate("window.viewer.getViewport()")
    return {key: float(value[key]) for key in ("x", "y", "scale")}


def viewport_equal(expected: dict[str, float], actual: dict[str, float]) -> bool:
    return all(abs(expected[key] - actual[key]) <= TOLERANCE for key in ("x", "y", "scale"))


def require_viewport_equal(expected: dict[str, float], actual: dict[str, float]) -> None:
    if not viewport_equal(expected, actual):
        raise AssertionError(f"viewport changed: expected={expected}, actual={actual}")


def git_status() -> str:
    return subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    ).stdout


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def atomic_write(path: Path, text: str) -> None:
    temporary = path.with_suffix(path.suffix + ".proof-tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def run_production_boundary(workspace: Path) -> dict[str, bool]:
    output = workspace / "production-dist"
    subprocess.run(
        ["node", str(BUILD_SCRIPT), "--out", str(output)],
        cwd=workspace,
        check=True,
        text=True,
        capture_output=True,
    )
    entry = (output / "entry.js").read_text(encoding="utf-8")
    return {
        "productionRevisionAbsent": not (output / "__dev_revision.txt").exists(),
        "devPollingAbsentFromProduction": not (output / "ssg-output-refresh.js").exists()
        and "ssg-output-refresh" not in entry
        and "startSsgOutputRefresh" not in entry,
        "caddyAbsentFromProduction": "caddy" not in entry.lower(),
    }


def start_process(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.Popen[str]:
    return subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=8)


def prepare_wrangler(workspace: Path, port: int) -> tuple[list[subprocess.Popen[str]], str, str]:
    config_path = workspace / "wrangler.dev.jsonc"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["build"]["command"] = f'node "{BUILD_SCRIPT}" --dev'
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    environment = os.environ.copy()
    environment["WRANGLER_SEND_METRICS"] = "false"
    server = start_process(
        [
            "npx",
            "--yes",
            f"wrangler@{WRANGLER_VERSION}",
            "dev",
            "--config",
            "wrangler.dev.jsonc",
            "--port",
            str(port),
        ],
        workspace,
        environment,
    )
    return [server], WRANGLER_VERSION, "wrangler-custom-build"


def prepare_caddy(workspace: Path, port: int) -> tuple[list[subprocess.Popen[str]], str, str]:
    executable = os.environ.get("CADDY_EXECUTABLE") or shutil.which("caddy")
    if executable is None or not Path(executable).exists():
        raise RuntimeError("Caddy executable was not found")
    expected = os.environ.get("CADDY_EXPECTED_VERSION", DEFAULT_CADDY_VERSION)
    version_output = subprocess.run(
        [executable, "version"],
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
    actual = version_output.split()[0] if version_output else ""
    if actual != expected:
        raise AssertionError(f"unexpected Caddy version: expected={expected}, actual={version_output}")

    watcher = start_process(
        ["node", str(BUILD_SCRIPT), "--dev", "--watch"],
        workspace,
    )
    wait_for_path(workspace / "dist" / "__dev_revision.txt")
    server = start_process(
        [
            executable,
            "file-server",
            "--root",
            str(workspace / "dist"),
            "--listen",
            f"127.0.0.1:{port}",
        ],
        workspace,
    )
    return [watcher, server], actual, "node-builtins"


def run_browser_proof(page: Page, workspace: Path, screenshot_path: Path) -> dict[str, Any]:
    page.wait_for_function("window.viewer?.getData()?.compilerMarker === 'compiler-v1'")
    page.wait_for_function("document.querySelector('#refresh-state').textContent === '監視中'")

    instance_before = page.evaluate("document.documentElement.dataset.pageInstance")
    page.evaluate("window.__proofViewerRoot = document.querySelector('#viewer')")

    viewer = page.locator("#viewer")
    bounds = viewer.bounding_box()
    if bounds is None:
        raise AssertionError("viewer bounds were unavailable")

    center_x = bounds["x"] + bounds["width"] * 0.56
    center_y = bounds["y"] + bounds["height"] * 0.48
    page.mouse.move(center_x, center_y)
    page.mouse.wheel(0, -520)
    page.mouse.down()
    page.mouse.move(center_x + 137, center_y - 83, steps=8)
    page.mouse.up()
    page.wait_for_timeout(100)

    viewport_before = viewport(page)
    if viewport_before["scale"] <= 1.0:
        raise AssertionError(f"zoom interaction failed: {viewport_before}")

    content_path = workspace / "content" / "scene.json"
    content = json.loads(content_path.read_text(encoding="utf-8"))
    token = str(time.time_ns())
    input_title = f"Input edit applied · {token}"
    content["title"] = input_title
    content["nodes"][0]["body"] = f"hot input update {token}"
    atomic_write(content_path, json.dumps(content, ensure_ascii=False, indent=2) + "\n")

    page.wait_for_function(
        "expected => document.querySelector('#scene-title').textContent === expected",
        arg=input_title,
        timeout=30_000,
    )
    page.wait_for_function("Number(document.querySelector('#update-count').textContent) >= 1")
    viewport_after_input = viewport(page)
    require_viewport_equal(viewport_before, viewport_after_input)

    compiler_path = workspace / "src" / "compile-scene.mjs"
    original_compiler = compiler_path.read_text(encoding="utf-8")
    compiler_marker = f"compiler-proof-{token}"
    edited_compiler = original_compiler.replace("compiler-v1", compiler_marker)
    if edited_compiler == original_compiler:
        raise AssertionError("compiler marker could not be edited")
    atomic_write(compiler_path, edited_compiler)

    page.wait_for_function(
        "expected => document.querySelector('#compiler-marker').textContent === expected",
        arg=compiler_marker,
        timeout=30_000,
    )
    page.wait_for_function("Number(document.querySelector('#update-count').textContent) >= 2")
    viewport_after_compiler = viewport(page)
    require_viewport_equal(viewport_before, viewport_after_compiler)

    revision_path = workspace / "dist" / "__dev_revision.txt"
    scene_path = workspace / "dist" / "generated" / "scene.json"
    revision_before_failure = revision_path.read_text(encoding="utf-8").strip()
    scene_before_failure = scene_path.read_text(encoding="utf-8")
    updates_before_failure = int(page.locator("#update-count").inner_text())
    if revision_before_failure != sha256_text(scene_before_failure):
        raise AssertionError("revision does not identify the complete generated output")

    atomic_write(content_path, "{ invalid json\n")
    page.wait_for_timeout(1800)
    revision_after_failure = revision_path.read_text(encoding="utf-8").strip()
    scene_after_failure = scene_path.read_text(encoding="utf-8")
    updates_after_failure = int(page.locator("#update-count").inner_text())
    failed_build_did_not_advance_revision = (
        revision_after_failure == revision_before_failure
        and scene_after_failure == scene_before_failure
        and updates_after_failure == updates_before_failure
    )
    if not failed_build_did_not_advance_revision:
        raise AssertionError("failed build advanced published output or browser state")

    instance_after = page.evaluate("document.documentElement.dataset.pageInstance")
    viewer_root_preserved = page.evaluate("document.querySelector('#viewer') === window.__proofViewerRoot")
    title_in_browser = page.locator("#scene-title").inner_text()
    compiler_in_browser = page.locator("#compiler-marker").inner_text()
    page.screenshot(path=str(screenshot_path), full_page=True)

    return {
        "inputHotRefresh": title_in_browser == input_title,
        "compilerHotRefresh": compiler_in_browser == compiler_marker,
        "viewportPreservedAfterInput": viewport_equal(viewport_before, viewport_after_input),
        "viewportPreservedAfterCompiler": viewport_equal(viewport_before, viewport_after_compiler),
        "pageInstancePreserved": instance_after == instance_before,
        "viewerRootPreserved": viewer_root_preserved,
        "observedUpdateCount": updates_before_failure,
        "revisionPublishedAfterOutput": revision_before_failure == sha256_text(scene_before_failure),
        "failedBuildDidNotAdvanceRevision": failed_build_did_not_advance_revision,
        "viewportBefore": viewport_before,
        "viewportAfterInput": viewport_after_input,
        "viewportAfterCompiler": viewport_after_compiler,
        "pageInstance": instance_before,
        "sourceChanges": {
            "inputTitle": input_title,
            "compilerMarker": compiler_marker,
            "failedInput": "invalid-json-negative-control",
        },
    }


def main() -> None:
    args = parse_args()
    artifact = Path(os.environ.get("SSG_HOT_REFRESH_ARTIFACT_OUT", DEFAULT_ARTIFACT))
    if args.server == "wrangler" and artifact.exists():
        shutil.rmtree(artifact)
    (artifact / "proof").mkdir(parents=True, exist_ok=True)
    (artifact / "screenshots").mkdir(parents=True, exist_ok=True)
    report_name = "report.json" if args.server == "wrangler" else "caddy-report.json"
    screenshot_name = "after-two-refreshes.png" if args.server == "wrangler" else "caddy-after-two-refreshes.png"
    report_path = artifact / "proof" / report_name
    screenshot_path = artifact / "screenshots" / screenshot_name

    status_before = git_status()
    report: dict[str, Any] = {
        "kind": "ui.ssgHotRefreshViewportProof.v1",
        "server": args.server,
        "passed": False,
        "generatedArtifactsAreAuthority": False,
        "tolerance": TOLERANCE,
        "caddyOwnsWatchOrBuild": False,
    }
    processes: list[subprocess.Popen[str]] = []

    try:
        with tempfile.TemporaryDirectory(prefix=f"ui-ssg-hot-refresh-{args.server}-") as temporary:
            workspace = Path(temporary) / "workspace"
            shutil.copytree(FIXTURE, workspace)

            production_checks = run_production_boundary(workspace)
            if not all(production_checks.values()):
                raise AssertionError(f"production boundary failed: {production_checks}")

            port = free_port()
            base_url = f"http://127.0.0.1:{port}"
            if args.server == "wrangler":
                processes, server_version, watcher = prepare_wrangler(workspace, port)
            else:
                processes, server_version, watcher = prepare_caddy(workspace, port)
            wait_for_server(base_url)

            with sync_playwright() as playwright:
                configured_browser = os.environ.get("CHROMIUM_EXECUTABLE")
                browser_candidates = [
                    configured_browser,
                    playwright.chromium.executable_path,
                    shutil.which("chromium"),
                    shutil.which("google-chrome"),
                    shutil.which("google-chrome-stable"),
                ]
                browser_path = next(
                    (candidate for candidate in browser_candidates if candidate and Path(candidate).exists()),
                    None,
                )
                if browser_path is None:
                    raise RuntimeError("Chromium was not found")
                browser = playwright.chromium.launch(
                    headless=True,
                    executable_path=browser_path,
                    args=["--no-sandbox"],
                )
                page = browser.new_page(viewport={"width": 1440, "height": 960})
                main_frame_navigations = 0

                def count_navigation(frame: Any) -> None:
                    nonlocal main_frame_navigations
                    if frame == page.main_frame:
                        main_frame_navigations += 1

                page.on("framenavigated", count_navigation)
                page.goto(base_url, wait_until="domcontentloaded")
                proof = run_browser_proof(page, workspace, screenshot_path)
                browser.close()

                checks = {
                    key: proof[key]
                    for key in (
                        "inputHotRefresh",
                        "compilerHotRefresh",
                        "viewportPreservedAfterInput",
                        "viewportPreservedAfterCompiler",
                        "pageInstancePreserved",
                        "viewerRootPreserved",
                        "observedUpdateCount",
                        "revisionPublishedAfterOutput",
                        "failedBuildDidNotAdvanceRevision",
                    )
                }
                checks["mainFrameNavigationCount"] = main_frame_navigations
                checks.update(production_checks)

                if checks["mainFrameNavigationCount"] != 1:
                    raise AssertionError(f"unexpected navigation count: {checks['mainFrameNavigationCount']}")
                if checks["observedUpdateCount"] < 2:
                    raise AssertionError(f"insufficient update count: {checks['observedUpdateCount']}")
                if not all(
                    value is True
                    for key, value in checks.items()
                    if key not in {"mainFrameNavigationCount", "observedUpdateCount"}
                ):
                    raise AssertionError(f"proof checks failed: {checks}")

                report.update(
                    {
                        "passed": True,
                        "serverVersion": server_version,
                        "watcher": watcher,
                        **checks,
                        "viewportBefore": proof["viewportBefore"],
                        "viewportAfterInput": proof["viewportAfterInput"],
                        "viewportAfterCompiler": proof["viewportAfterCompiler"],
                        "pageInstance": proof["pageInstance"],
                        "screenshot": f"screenshots/{screenshot_name}",
                        "sourceChanges": proof["sourceChanges"],
                    }
                )
    except Exception as error:
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        for process in reversed(processes):
            stop_process(process)
        status_after = git_status()
        report["sourceTreeCleanAfterTest"] = status_after == status_before
        if report.get("passed") and not report["sourceTreeCleanAfterTest"]:
            report["passed"] = False
            report["error"] = "source tree changed during isolated proof"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not report["passed"]:
        raise AssertionError(report.get("error", "proof failed"))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
