import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED = [
  {
    id: "linked_issue",
    pattern: /(?:\b(?:Fixes|Closes|Resolves|Refs)\s+#\d+\b)|(?:\bLinked issue\s*:\s*(?:Fixes|Closes|Resolves|Refs)?\s*#\d+\b)|(?:\bIssue\s*:\s*#\d+\b)/i,
  },
  {
    id: "scope",
    pattern: /(?:^|\n)##\s*Scope\b|\bScope\s*:/i,
  },
  {
    id: "non_scope",
    pattern: /(?:^|\n)##\s*Non-scope\b|\bNon-scope\s*:/i,
  },
  {
    id: "ci_or_test_evidence",
    pattern: /\b(?:CI evidence|Test evidence|Tests|Verification)\b/i,
  },
  {
    id: "merge_condition",
    pattern: /(?:^|\n)##\s*Merge condition\b|\bMerge-blocking conditions\b|\bMerge conditions\b/i,
  },
  {
    id: "human_approval",
    pattern: /\b(?:explicit human approval|human merge approval|Do not merge automatically|must not merge)\b/i,
  },
];

export function findPrBodyGovernanceGaps(body) {
  const text = String(body || "");
  return REQUIRED.filter((rule) => !rule.pattern.test(text)).map((rule) => rule.id);
}

export function assertPrBodyGoverned(body) {
  const gaps = findPrBodyGovernanceGaps(body);
  assert.deepEqual(gaps, [], `PR body governance gaps: ${gaps.join(", ")}`);
}

function readBody(args) {
  const envIndex = args.indexOf("--body-env");
  if (envIndex >= 0) return process.env[args[envIndex + 1] || ""] || "";

  const fileIndex = args.indexOf("--body-file");
  if (fileIndex >= 0) return fs.readFileSync(args[fileIndex + 1], "utf8");

  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    return event.pull_request?.body || "";
  }

  return null;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const body = readBody(process.argv.slice(2));
  assert.notEqual(body, null, "pass --body-env, --body-file, or GITHUB_EVENT_PATH");
  const gaps = findPrBodyGovernanceGaps(body);
  if (gaps.length > 0) {
    console.error(JSON.stringify({ status: "pr-body-governance-fail", gaps }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "pr-body-governance-pass" }, null, 2));
}
