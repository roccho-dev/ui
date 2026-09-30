# Local document CLI

A thin Node entrypoint to the existing `renderMarkdownDocument` capability.
It is not a second renderer, audience compiler, TUI, web app or delivery service.

## Run from an exact ui checkout

```sh
node apps/document-cli/main.mjs examples/document-cli/input/model.json
node apps/document-cli/main.mjs model.json template.jsonl
```

No npm install, browser, server or network call is required. Use the repository's
Node environment. The same CLI can be invoked with an absolute script path from
another working directory; input paths are relative to the caller's directory.
This source entrypoint does not claim a new standalone Nix or native artifact.

The first file is UTF-8 JSON containing **only** the existing `document.model.v1`
model. The optional second file contains existing `md.template.block.v1` JSONL.
There is no wrapper model, new schema, renderer selector or URL input. A path
starting with `-` can be passed with a `./` prefix. `--help` prints usage.

## Result and failures

On success, stdout contains one JSON value followed by a newline: the existing
`ui.markdown-render.result.v1`, including `markdown`, `diagnostics`, `provenance`
and `ok`. Warnings remain visible; `ok` is the renderer's bounded validation
result, not external approval, rendering completeness or audience safety.

| Condition | Exit | stdout | stderr |
|---|---:|---|---|
| Valid model, including renderer warnings | 0 | Existing result JSON | Empty |
| `--help` | 0 | Usage text | Empty |
| Wrong arguments or URL input | 2 | Empty | `document-cli: E_USAGE` and usage |
| Unreadable file, invalid UTF-8 or model JSON | 1 | Empty | `document-cli: E_INPUT` |
| Renderer throws or returns a blocking result | 1 | Empty | `document-cli: E_RENDER` |
| Output stream fails | 1 | May be partial | `document-cli: E_OUTPUT` |

Failed rendering is never written as a successful artifact. An output-stream
failure cannot retract bytes already written; callers must check exit status
before treating redirected output as complete. There is no atomic file publisher
or write-to-directory option. Inputs are never changed by the CLI.

The CLI does not print input contents, exception stacks or local paths on errors.
Successful output intentionally contains the requested model's rendered content.
It must therefore receive data already suitable for its intended reader. It is
**not** a disclosure filter, HTML/link sanitizer or authentication boundary.
Do not run it as an unbounded public upload service.

## Proof

```sh
node tests/check-document-cli.mjs
```

The same checked-in model is used by the library and the real CLI subprocess.
Tests verify an independent Markdown expectation, library/result parity,
provenance, repeatability, template input, warnings, failures, a clean working
directory and unchanged input files. They do not prove TUI or provider delivery.
The test is included in the existing `tests/run-all.mjs` / `check:base` path.
