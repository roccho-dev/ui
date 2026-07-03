import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const outRoot = path.resolve(process.argv[2] || process.env.PURPOSE_VISUALIZATION_OUT || "purpose-visualization-result");
const htmlPath = path.join(outRoot, "purpose-visualization-html", "index.html");
const screenshotsDir = path.join(outRoot, "purpose-visualization-screenshots");
const evidenceDir = path.join(outRoot, "purpose-visualization-evidence");
const reportPath = path.join(evidenceDir, "screenshot-report.json");
const manifestPath = path.join(evidenceDir, "manifest.json");
const chrome = findChrome();

if (!fs.existsSync(htmlPath)) throw new Error(`HTML artifact missing: ${htmlPath}`);
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const specs = [
  { name: "overview", file: "01-overview.png", view: "overview", tokens: ["Purpose visualization", "runtime executed", "高価値法人構築と売却"] },
  { name: "closure", file: "02-closure.png", view: "closure", tokens: ["Purpose closure object", "高価値法人構築と売却"] },
  { name: "selected gap", file: "03-selected-gap.png", view: "selected-gap", tokens: ["Selected gap", "ideal:", "current:", "delta:"] },
  { name: "work order", file: "04-work-order.png", view: "work-order", tokens: ["Work order", "scope:", "non-scope:", "closure:"] },
  { name: "receipt", file: "05-receipt.png", view: "receipt", tokens: ["Receipt", "receipt states are separated", "reduced", "residual"] },
  { name: "residual", file: "06-residual.png", view: "residual", tokens: ["Residual next input", "returned residuals", "true"] },
];
const results = [];
for (const spec of specs) {
  const url = `${pathToFileURL(htmlPath).href}?view=${encodeURIComponent(spec.view)}`;
  const dom = runChrome([...commonChromeArgs(), "--dump-dom", url], `dump-dom ${spec.name}`).stdout;
  assertNoFatalText(dom, `dump-dom ${spec.name}`);
  const missing = spec.tokens.filter((token) => !dom.includes(token));
  if (missing.length) throw new Error(`${spec.name}: missing visible runtime token(s): ${missing.join(", ")}`);
  const screenshotPath = path.join(screenshotsDir, spec.file);
  runChrome([...commonChromeArgs(), `--screenshot=${screenshotPath}`, url], `screenshot ${spec.name}`);
  const size = fs.statSync(screenshotPath).size;
  if (size < 5000) throw new Error(`${spec.name}: screenshot too small or blank: ${size} bytes`);
  results.push({ name: spec.name, file: path.relative(outRoot, screenshotPath).split(path.sep).join("/"), url, tokens: spec.tokens, size });
}
const report = {
  kind: "ui.purposeVisualizationRuntimeScreenshots.v1",
  status: "purpose-visualization-runtime-screenshots-pass",
  commit: process.env.GITHUB_SHA || "local",
  chrome,
  html: path.relative(outRoot, htmlPath).split(path.sep).join("/"),
  screenshots: results,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.runtimeScreenshotReport = "purpose-visualization-evidence/screenshot-report.json";
  manifest.runtimeScreenshotStatus = report.status;
  manifest.screenshotFiles = results.map((item) => item.file);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
console.log(JSON.stringify(report, null, 2));

function commonChromeArgs() {
  return ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--window-size=1440,1000"];
}
function runChrome(args, label) {
  const result = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30000 });
  const stderr = result.stderr || "";
  if (result.error) throw new Error(`${label}: chromium failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: chromium exited ${result.status}\n${stderr}`);
  assertNoFatalText(stderr, label);
  return { stdout: result.stdout || "", stderr };
}
function assertNoFatalText(text, label) {
  const fatal = /(Uncaught|ReferenceError|TypeError|SyntaxError|ERR_FILE_NOT_FOUND|net::ERR)/;
  if (fatal.test(text)) throw new Error(`${label}: fatal runtime text found\n${text}`);
}
function findChrome() {
  const env = process.env.CHROME_BIN;
  if (env && fs.existsSync(env)) return env;
  const candidates = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const candidate of candidates) {
    if (candidate.startsWith("/") && fs.existsSync(candidate)) return candidate;
    const found = spawnSync("bash", ["-lc", `command -v ${candidate}`], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error("No headless browser found. Set CHROME_BIN or install chromium/google-chrome.");
}
