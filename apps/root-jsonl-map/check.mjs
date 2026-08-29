import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

assert.equal((html.match(/fetch\("\/"/gu) ?? []).length, 1, "exactly one root fetch");
assert.doesNotMatch(html, /fetch\("\/(?:data|health|config|proof)/u);
assert.match(html, /application\/x-ndjson, application\/json;q=0\.9/u);
assert.match(html, /credentials: "same-origin"/u);
assert.match(html, /redirect: "error"/u);
assert.match(html, /response\.status === 401/u);
assert.match(html, /認証が必要です/u);
assert.match(html, /response\.status === 403/u);
assert.match(html, /このデータを表示する権限がありません/u);
assert.match(html, /\["package_id", "decision_id", "id", "schema"\]/u);
assert.match(html, /\["responsibility", "summary", "description", "status", "schema"\]/u);
assert.doesNotMatch(html, /innerHTML/u);
assert.doesNotMatch(html, /<script[^>]+src=/u);
assert.doesNotMatch(html, /<link[^>]+href=/u);

console.log(JSON.stringify({
  schema: "ui.rootJsonlMapCheck/1",
  status: "PASS",
  endpoint: "/",
  input: ["application/x-ndjson", "application/json"],
  projection: "record-to-map-card/1",
  authority: false
}));
