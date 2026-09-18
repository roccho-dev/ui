from __future__ import annotations

import hashlib
from pathlib import Path

from playwright.sync_api import BrowserContext, Page


def install_test_crypto(page: Page) -> None:
    page.expose_function(
        "__semanticTestSha256",
        lambda values: list(hashlib.sha256(bytes(values)).digest()),
    )
    page.evaluate(
        """() => {
          let uuidSequence = 0;
          Object.defineProperty(crypto, 'subtle', {
            configurable: true,
            value: {
              digest: async (_algorithm, input) => Uint8Array.from(
                await __semanticTestSha256([...new Uint8Array(input)])
              ).buffer,
            },
          });
          Object.defineProperty(crypto, 'randomUUID', {
            configurable: true,
            value: () => {
              uuidSequence += 1;
              return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, '0')}`;
            },
          });
        }"""
    )


def load_app(
    context: BrowserContext,
    html_path: Path,
    errors: list[str],
    *,
    fragment: str = "",
    url: str = "",
    viewport: dict[str, int] | None = None,
    expect_ready: bool = True,
) -> Page:
    assert not (fragment and url), "fragment and url are mutually exclusive"
    page = context.new_page()
    if viewport:
        page.set_viewport_size(viewport)
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_test_crypto(page)
    if url:
        page.evaluate("value => history.replaceState(null, '', value)", url)
    elif fragment:
        page.evaluate("value => history.replaceState(null, '', value)", fragment)
    page.set_content(html_path.read_text(encoding="utf-8"), wait_until="load")
    if expect_ready:
        page.wait_for_function("globalThis.semanticMapSite?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapApp?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapRuntime?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapReview?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapHandoff?.ready === true", timeout=30_000)
        page.wait_for_function("globalThis.semanticMapSource?.ready === true", timeout=30_000)
    else:
        page.wait_for_function("globalThis.semanticMapSite?.ready === false", timeout=30_000)
    return page


def boxes(page: Page, ids: list[str]) -> dict[str, object]:
    return page.evaluate(
        """ids => {
          const values = Object.fromEntries(ids.map((id) => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return [id, {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height}];
          }));
          const overlaps=[];
          for (let i=0;i<ids.length;i+=1) for (let j=i+1;j<ids.length;j+=1) {
            const a=values[ids[i]], b=values[ids[j]];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push([ids[i],ids[j]]);
          }
          return {
            values,
            overlaps,
            withinViewport:Object.values(values).every((rect) => rect.width>0 && rect.height>0 && rect.left>=0 && rect.top>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight),
          };
        }""",
        ids,
    )
