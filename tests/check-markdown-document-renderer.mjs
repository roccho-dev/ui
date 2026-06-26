import assert from "node:assert/strict";

import {
  DOCUMENT_MODEL_KIND,
  MARKDOWN_DOCUMENT_RENDERER_VERSION,
  parseMarkdownTemplateJsonl,
  renderMarkdownDocument,
} from "../src/index.mjs";

const model = {
  kind: DOCUMENT_MODEL_KIND,
  blocks: [
    { kind: "heading", depth: 1, text: "Example README" },
    { kind: "paragraph", text: "One pure renderer." },
    { kind: "list", items: ["document model", "Markdown bytes"] },
  ],
};

const template = parseMarkdownTemplateJsonl(`
{"kind":"md.template.block.v1","slot":"after","block":{"kind":"paragraph","text":"Renderer provenance is attached."}}
`);

const result = renderMarkdownDocument({ model, template });
assert.equal(result.kind, "ui.markdown-render.result.v1");
assert.equal(result.ok, true);
assert.deepEqual(result.diagnostics, []);
assert.equal(result.markdown, `# Example README

One pure renderer.

- document model
- Markdown bytes

Renderer provenance is attached.
`);
assert.equal(result.provenance.kind, "ui.markdown-render.provenance.v1");
assert.equal(result.provenance.rendererVersion, MARKDOWN_DOCUMENT_RENDERER_VERSION);
assert.equal(result.provenance.outputKind, "markdown.bytes.v1");
assert.equal(result.provenance.generatedArtifactsAreAuthority, false);
assert.match(result.provenance.modelDigest, /^[a-f0-9]{64}$/);
assert.match(result.provenance.templateDigest, /^[a-f0-9]{64}$/);
assert.match(result.provenance.markdownDigest, /^[a-f0-9]{64}$/);

const repeat = renderMarkdownDocument({ model, template });
assert.equal(repeat.markdown, result.markdown, "same input renders identical Markdown");
assert.equal(repeat.provenance.markdownDigest, result.provenance.markdownDigest, "same input has stable Markdown digest");

const unknown = renderMarkdownDocument({
  model: {
    kind: DOCUMENT_MODEL_KIND,
    blocks: [{ kind: "mystery", text: "not silently dropped" }],
  },
});
assert.equal(unknown.ok, true, "unknown render block is diagnostic, not policy authority");
assert.match(unknown.markdown, /\[unsupported block: mystery\]/);
assert.ok(unknown.diagnostics.some((item) => item.code === "unknown_block"));

const unsafe = renderMarkdownDocument({
  model: {
    kind: DOCUMENT_MODEL_KIND,
    blocks: [{ kind: "paragraph", text: "<script>alert(1)</script>" }],
  },
});
assert.equal(unsafe.ok, true);
assert.ok(unsafe.diagnostics.some((item) => item.code === "unsafe_markdown_html"));
assert.match(unsafe.markdown, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(unsafe.markdown, /<script>/);

const authority = renderMarkdownDocument({
  model: {
    kind: DOCUMENT_MODEL_KIND,
    mergeReady: true,
    blocks: [{ kind: "paragraph", text: "authority must remain upstream" }],
  },
});
assert.equal(authority.ok, false);
assert.ok(authority.diagnostics.some((item) => item.severity === "blocking" && item.code === "forbidden_authority_field"));

const badTemplate = renderMarkdownDocument({
  model,
  template: [{ kind: "md.template.unknown.v1", slot: "before", block: { kind: "paragraph", text: "ignored" } }],
});
assert.ok(badTemplate.diagnostics.some((item) => item.code === "unknown_template_row"));
assert.doesNotMatch(result.markdown, /<html/i, "README artifact renderer does not emit HTML output");

console.log(JSON.stringify({
  status: "markdown-document-renderer-check-pass",
  rendererVersion: MARKDOWN_DOCUMENT_RENDERER_VERSION,
  markdownDigest: result.provenance.markdownDigest,
}, null, 2));
