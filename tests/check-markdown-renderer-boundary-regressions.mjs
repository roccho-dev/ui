import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DOCUMENT_MODEL_KIND,
  renderMarkdownDocument,
} from "../src/index.mjs";

function blockingCodes(result) {
  return result.diagnostics
    .filter((item) => item.severity === "blocking")
    .map((item) => item.code);
}

function assertForbiddenAuthorityField({ name, model, expectedPath }) {
  const result = renderMarkdownDocument({ model });
  assert.equal(result.ok, false, `${name}: fixture must block`);
  assert.ok(blockingCodes(result).includes("forbidden_authority_field"), `${name}: failure reason is explicit`);
  assert.ok(
    result.diagnostics.some((item) => item.severity === "blocking" && item.path === expectedPath),
    `${name}: diagnostic points to ${expectedPath}`,
  );
  assert.equal(result.provenance.outputKind, "markdown.bytes.v1", `${name}: output kind remains Markdown bytes`);
  assert.equal(result.provenance.generatedArtifactsAreAuthority, false, `${name}: renderer output is never authority`);
}

const safeBaseModel = {
  kind: DOCUMENT_MODEL_KIND,
  blocks: [{ kind: "paragraph", text: "Renderer fixture." }],
};

assertForbiddenAuthorityField({
  name: "adr-row-read",
  expectedPath: "$.model.adrRows",
  model: {
    ...safeBaseModel,
    adrRows: [{ kind: "adr.row.v1", decision: "must stay upstream" }],
  },
});

assertForbiddenAuthorityField({
  name: "governance-policy-validation",
  expectedPath: "$.model.policyValidation",
  model: {
    ...safeBaseModel,
    policyValidation: { kind: "governance.policy.validation.v1", result: "pass" },
  },
});

assertForbiddenAuthorityField({
  name: "artifact-upload-lifecycle",
  expectedPath: "$.model.artifactUpload",
  model: {
    ...safeBaseModel,
    artifactUpload: { owner: "ui-lib", lifecycle: "publish" },
  },
});

const htmlProbe = renderMarkdownDocument({
  model: {
    kind: DOCUMENT_MODEL_KIND,
    blocks: [{ kind: "paragraph", text: "<main>README</main>" }],
  },
});
assert.equal(htmlProbe.ok, true, "HTML-like text is escaped, not owned as an HTML artifact");
assert.equal(htmlProbe.provenance.outputKind, "markdown.bytes.v1");
assert.match(htmlProbe.markdown, /&lt;main&gt;README&lt;\/main&gt;/);
assert.doesNotMatch(htmlProbe.markdown, /<main>/);
assert.doesNotMatch(htmlProbe.markdown, /<!doctype|<html|<body/i, "README artifact path must not emit an HTML document");

const rendererSource = readFileSync(new URL("../src/markdown-document-renderer.mjs", import.meta.url), "utf8");
const forbiddenSourcePatterns = [
  ["ADR row file read", /readFileSync|createReadStream|openSync/],
  ["governance policy validator", /validatePolicy|policyValidator|governancePolicyValidator/],
  ["HTML document output", /<!doctype|<html|<body|outputKind:\s*["']html\.bytes\.v1["']/i],
  ["artifact upload implementation", /actions\/upload-artifact|artifactLifecycleOwner|artifactUploader/],
];
for (const [name, pattern] of forbiddenSourcePatterns) {
  assert.doesNotMatch(rendererSource, pattern, `renderer source must not contain ${name}`);
}

console.log(JSON.stringify({
  status: "markdown-renderer-boundary-regressions-pass",
  fixtures: [
    "adr-row-read",
    "governance-policy-validation",
    "readme-artifact-html-output",
    "artifact-upload-lifecycle",
  ],
}, null, 2));
