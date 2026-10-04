import crypto from "node:crypto";

export const MARKDOWN_DOCUMENT_RENDERER_VERSION = "ui.markdown-document-renderer.v1";
export const DOCUMENT_MODEL_KIND = "document.model.v1";
export const TEMPLATE_BLOCK_KIND = "md.template.block.v1";

const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "adrRow",
  "adrRows",
  "acceptedAdrRow",
  "acceptedAdrRows",
  "artifactLifecycle",
  "artifactOwner",
  "artifactUpload",
  "approval",
  "approvalStatus",
  "canonicalState",
  "fireAuthorization",
  "governancePolicyValidation",
  "mergeApproval",
  "mergeReady",
  "policyDecision",
  "policyValidation",
  "uploadArtifact",
]);

const BLOCK_KINDS = new Set([
  "heading",
  "document.heading.v1",
  "paragraph",
  "document.paragraph.v1",
  "list",
  "document.list.v1",
  "table",
  "document.table.v1",
  "code",
  "document.code.v1",
  "link",
  "document.link.v1",
]);

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function parseMarkdownTemplateJsonl(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

function diagnostic({ severity = "warning", code, message, path = "$" }) {
  return { kind: "ui.markdown-render.diagnostic.v1", severity, code, message, path };
}

function rawHtmlLike(value) {
  return /<\s*\/?\s*[a-zA-Z][^>]*>/.test(String(value));
}

function escapeUnsafeMarkdownText(value) {
  return String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function walk(value, visit, path = "$") {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, visit, `${path}.${key}`);
  }
}

function collectBoundaryDiagnostics(value, path = "$") {
  const diagnostics = [];
  walk(value, (item, itemPath) => {
    if (typeof item === "string" && rawHtmlLike(item)) {
      diagnostics.push(diagnostic({
        code: "unsafe_markdown_html",
        message: "raw HTML-like text is escaped by the Markdown renderer",
        path: itemPath,
      }));
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (FORBIDDEN_AUTHORITY_FIELDS.has(key)) {
          diagnostics.push(diagnostic({
            severity: "blocking",
            code: "forbidden_authority_field",
            message: `Markdown renderer input must not assert authority field ${key}`,
            path: `${itemPath}.${key}`,
          }));
        }
      }
    }
  }, path);
  return diagnostics;
}

function normalizeTemplate(template) {
  if (!template) return [];
  if (typeof template === "string") return parseMarkdownTemplateJsonl(template);
  if (Array.isArray(template)) return template;
  throw new Error("template must be JSONL text or an array of template rows");
}

function blockKind(block) {
  return block?.kind || block?.type;
}

function templateBlocks(rows, slot, diagnostics) {
  const blocks = [];
  rows.forEach((row, index) => {
    const path = `$.template[${index}]`;
    if (row?.kind !== TEMPLATE_BLOCK_KIND) {
      diagnostics.push(diagnostic({ code: "unknown_template_row", message: "template row kind is not supported", path: `${path}.kind` }));
      return;
    }
    if (row.slot !== slot) return;
    if (!row.block || typeof row.block !== "object") {
      diagnostics.push(diagnostic({ code: "missing_template_block", message: "template row requires a block object", path: `${path}.block` }));
      return;
    }
    blocks.push(row.block);
  });
  return blocks;
}

function renderInline(value) {
  return escapeUnsafeMarkdownText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function renderBlock(block, diagnostics, path) {
  const kind = blockKind(block);
  if (!BLOCK_KINDS.has(kind)) {
    diagnostics.push(diagnostic({ code: "unknown_block", message: `unknown Markdown document block: ${kind || "<missing>"}`, path: `${path}.kind` }));
    return `[unsupported block: ${renderInline(kind || "missing")}]`;
  }

  if (kind === "heading" || kind === "document.heading.v1") {
    const depth = Math.min(6, Math.max(1, Number(block.depth ?? block.level ?? 1)));
    return `${"#".repeat(depth)} ${renderInline(block.text ?? block.title ?? "")}`.trimEnd();
  }

  if (kind === "paragraph" || kind === "document.paragraph.v1") {
    return renderInline(block.text ?? "");
  }

  if (kind === "list" || kind === "document.list.v1") {
    const items = Array.isArray(block.items) ? block.items : [];
    return items.map((item) => `- ${renderInline(item)}`).join("\n");
  }

  if (kind === "table" || kind === "document.table.v1") {
    const columns = Array.isArray(block.columns) ? block.columns : [];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    if (columns.length === 0) {
      diagnostics.push(diagnostic({ code: "empty_table_columns", message: "table block requires columns", path: `${path}.columns` }));
      return "[unsupported block: table]";
    }
    const header = `| ${columns.map(renderInline).join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${columns.map((column) => renderInline(row?.[column] ?? "")).join(" | ")} |`);
    return [header, divider, ...body].join("\n");
  }

  if (kind === "code" || kind === "document.code.v1") {
    const language = String(block.language || "").replace(/[^A-Za-z0-9_-]/g, "");
    const text = String(block.text ?? block.code ?? "").replaceAll("```", "`​``");
    return `\`\`\`${language}\n${text}\n\`\`\``;
  }

  if (kind === "link" || kind === "document.link.v1") {
    const text = renderInline(block.text ?? block.href ?? "link").replaceAll("]", "\\]");
    const href = String(block.href ?? "").replace(/[\s)]+/g, "");
    return `[${text}](${href})`;
  }

  return "";
}

function rendererDigestFor(rendererVersion) {
  return sha256({
    kind: "ui.markdown-renderer.contract.v1",
    rendererVersion,
    documentModelKind: DOCUMENT_MODEL_KIND,
    templateBlockKind: TEMPLATE_BLOCK_KIND,
    outputKind: "markdown.bytes.v1",
    supportedBlockKinds: Array.from(BLOCK_KINDS).sort(),
  });
}

export function validateDocumentModel(model) {
  const diagnostics = [];
  if (!model || typeof model !== "object") {
    diagnostics.push(diagnostic({ severity: "blocking", code: "missing_document_model", message: "document.model.v1 input is required" }));
    return diagnostics;
  }
  if (model.kind !== DOCUMENT_MODEL_KIND) {
    diagnostics.push(diagnostic({ severity: "blocking", code: "invalid_document_model_kind", message: "document model kind must be document.model.v1", path: "$.model.kind" }));
  }
  if (!Array.isArray(model.blocks)) {
    diagnostics.push(diagnostic({ severity: "blocking", code: "missing_document_blocks", message: "document model requires a blocks array", path: "$.model.blocks" }));
  }
  return diagnostics;
}

export function renderMarkdownDocument(input = {}) {
  const model = input.model || input.documentModel || input;
  const template = normalizeTemplate(input.template || input.markdownTemplateJsonl);
  const renderOptions = input.renderOptions || input.options || {};
  const rendererVersion = input.rendererVersion || MARKDOWN_DOCUMENT_RENDERER_VERSION;
  const diagnostics = [
    ...validateDocumentModel(model),
    ...collectBoundaryDiagnostics(model, "$.model"),
    ...collectBoundaryDiagnostics(template, "$.template"),
  ];

  const modelBlocks = Array.isArray(model?.blocks) ? model.blocks : [];
  const blocks = [
    ...templateBlocks(template, "before", diagnostics),
    ...modelBlocks,
    ...templateBlocks(template, "after", diagnostics),
  ];

  const markdown = blocks
    .map((block, index) => renderBlock(block, diagnostics, `$.blocks[${index}]`))
    .filter((chunk) => chunk !== "")
    .join("\n\n")
    .trimEnd() + "\n";

  const provenance = {
    kind: "ui.markdown-render.provenance.v1",
    rendererVersion,
    rendererDigest: rendererDigestFor(rendererVersion),
    renderOptionsDigest: sha256(renderOptions),
    outputKind: "markdown.bytes.v1",
    modelDigest: sha256(model || null),
    templateDigest: sha256(template),
    markdownDigest: sha256(markdown),
    generatedArtifactsAreAuthority: false,
  };

  return {
    kind: "ui.markdown-render.result.v1",
    ok: !diagnostics.some((item) => item.severity === "blocking"),
    markdown,
    diagnostics,
    provenance,
  };
}
