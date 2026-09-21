import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) throw new Error("proof URL is required");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const failedResponses = [];

page.on("pageerror", error => pageErrors.push(String(error)));
page.on("console", message => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", request => failedRequests.push(request.url()));
page.on("response", response => {
  if (response.status() >= 400) failedResponses.push(response.status() + " " + response.url());
});

const response = await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
assert.equal(response?.status(), 200);
await page.waitForFunction(() => document.documentElement.dataset.proof === "pass", null, { timeout: 120000 });

const proof = await page.evaluate(() => window.__artifactProof);
assert.equal(proof.uiIr, "ui.ir.v1");
assert.match(proof.a2uiText, /artifact proof/u);
assert.equal(proof.semanticSvg, true);
assert.ok(proof.semanticCells >= 3);
assert.ok(await page.locator("#graph svg").count() >= 1);
assert.deepEqual(pageErrors, []);
assert.deepEqual(consoleErrors, []);
assert.deepEqual(failedRequests, []);
assert.deepEqual(failedResponses, []);

await browser.close();
console.log(JSON.stringify({ schema: "ui-nix-package-artifact-browser-proof/1", status: "PASS", proof }));
