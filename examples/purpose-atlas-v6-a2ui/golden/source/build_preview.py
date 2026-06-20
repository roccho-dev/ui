from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"


def main() -> None:
    shell = (SRC / "ui-shell.html").read_text(encoding="utf-8")
    css = (SRC / "ui.css").read_text(encoding="utf-8")
    core = (SRC / "model-core.js").read_text(encoding="utf-8")
    renderer = (SRC / "ui-renderer.js").read_text(encoding="utf-8")

    html = (
        shell.replace("__CSS__", css)
        .replace("__CORE__", core)
        .replace("__RENDERER__", renderer)
    )
    DIST.mkdir(parents=True, exist_ok=True)
    output = DIST / "purpose-decision-atlas-v6-ui-preview.html"
    output.write_text(html, encoding="utf-8")
    print(f"built {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
