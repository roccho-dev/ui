import {
  createSemanticIntentSubmission,
  submitSemanticIntent,
} from "../../packages/core-port/src/intent-client.mjs";

const form = document.querySelector("#intent-form");
const topicId = document.querySelector("#topic-id");
const topicTitle = document.querySelector("#topic-title");
const body = document.querySelector("#body");
const submitButton = document.querySelector("#submit-intent");
const retryButton = document.querySelector("#retry-intent");
const transportState = document.querySelector("#transport-state");
const localState = document.querySelector("#local-state");
const githubState = document.querySelector("#github-state");
const issueIdentity = document.querySelector("#issue-identity");
const diagnostics = document.querySelector("#diagnostics");

const TRANSPORT_LABELS = Object.freeze({
  idle: "未送信",
  sending: "送信中",
  received: "応答受信",
  unknown: "結果不明",
  rejected: "応答拒否",
});
const LOCAL_LABELS = Object.freeze({
  accepted: "保存済み",
  no_change: "保存済み（重複なし）",
  rejected: "拒否",
  failed: "保存失敗",
  unknown: "未確認",
});
const GITHUB_LABELS = Object.freeze({
  not_started: "未開始",
  pending: "反映待ち",
  applied: "反映済み",
  unknown: "結果不明",
  permanent_failure: "恒久失敗",
});

let retrySubmission = null;
let sending = false;

function setOutput(element, value, labels) {
  element.dataset.state = value;
  element.textContent = labels[value] ?? value;
}

function render(result) {
  setOutput(transportState, result.transport_state, TRANSPORT_LABELS);
  setOutput(localState, result.local_state ?? "unknown", LOCAL_LABELS);
  setOutput(githubState, result.github_state ?? "unknown", GITHUB_LABELS);
  issueIdentity.textContent = result.issue_number ? `#${result.issue_number}` : "—";
  diagnostics.textContent = JSON.stringify(result, null, 2);
  retryButton.hidden = result.transport_state !== "unknown";
}

function setSending(value) {
  sending = value;
  submitButton.disabled = value;
  retryButton.disabled = value;
  if (value) setOutput(transportState, "sending", TRANSPORT_LABELS);
}

async function sendPrepared(submission) {
  if (sending) return;
  setSending(true);
  const result = await submitSemanticIntent(submission);
  retrySubmission = result.transport_state === "unknown" ? submission : null;
  if (result.local_state === "accepted" || result.local_state === "no_change") {
    topicTitle.value = "";
  }
  setSending(false);
  render(result);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const draft = {
    topic_id: topicId.value,
    body: body.value,
  };
  if (topicTitle.value.trim() !== "") draft.topic_title = topicTitle.value;

  try {
    const submission = createSemanticIntentSubmission(draft);
    retrySubmission = submission;
    await sendPrepared(submission);
  } catch (error) {
    retrySubmission = null;
    render({
      transport_state: "rejected",
      local_state: "unknown",
      github_state: "not_started",
      error_code: "client_validation",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

retryButton.addEventListener("click", async () => {
  if (retrySubmission) await sendPrepared(retrySubmission);
});
