from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = DIST / "purpose-atlas-v6-a2ui-ui-refactor.preview.html"


def required_match(pattern: str, text: str, label: str) -> str:
    match = re.search(pattern, text)
    if not match:
        raise SystemExit(f"standalone build failed: {label} asset not found")
    return match.group(1)


def main() -> None:
    index = (DIST / "index.html").read_text(encoding="utf-8")
    css_name = required_match(r'href="([^"]+\.css)"', index, "CSS").lstrip("/")
    js_name = required_match(r'src="([^"]+\.js)"', index, "JavaScript").lstrip("/")
    css = (DIST / css_name).read_text(encoding="utf-8")
    javascript = (DIST / js_name).read_text(encoding="utf-8")
    javascript = re.sub(r"\n?//# sourceMappingURL=.*?$", "", javascript, flags=re.MULTILINE)
    javascript = javascript.replace("</script", "<\\/script")
    surface = (DIST / "a2ui" / "purpose-atlas.surface.jsonl").read_text(encoding="utf-8")

    fetch_shim = f"""
const __purposeAtlasSurfaceJsonl = {json.dumps(surface, ensure_ascii=False)};
const __purposeAtlasOriginalFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = async function purposeAtlasStandaloneFetch(input, init) {{
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('purpose-atlas.surface.jsonl')) {{
    return new Response(__purposeAtlasSurfaceJsonl, {{
      status: 200,
      headers: {{'Content-Type': 'application/x-ndjson; charset=utf-8'}},
    }});
  }}
  if (__purposeAtlasOriginalFetch) return __purposeAtlasOriginalFetch(input, init);
  throw new Error('Unexpected standalone fetch: ' + url);
}};
""".strip().replace("</script", "<\\/script")

    html = f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#06101e">
  <meta name="description" content="Purpose Decision Atlas v6 — A2UI source-UI refactor standalone witness">
  <title>Purpose Decision Atlas v6 — A2UI source UI</title>
  <style>{css}</style>
</head>
<body>
  <purpose-atlas-app></purpose-atlas-app>
  <script>{fetch_shim}</script>
  <script type="module">{javascript}</script>
</body>
</html>
"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"built {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
