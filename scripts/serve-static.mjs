import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const USAGE = "usage: node scripts/serve-static.mjs [--host <address>] [--port <0-65535>] [--root <directory>]";
const { HOST, PORT, ROOT } = readOptions(process.argv.slice(2));
const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function readOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { host: { type: "string" }, port: { type: "string" }, root: { type: "string" } } }));
  } catch (error) {
    fail(error.message);
  }
  const host = values.host ?? "127.0.0.1";
  if (!host) fail("--host must not be empty");
  const port = values.port === undefined ? 18083 : Number(values.port);
  if (!/^\d+$/.test(values.port ?? "0") || port > 65535) fail(`--port must be an integer from 0 to 65535: ${values.port}`);
  if (values.root === "") fail("--root must not be empty");
  const requestedRoot = values.root === undefined ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(values.root);
  let root;
  try {
    root = fs.realpathSync(requestedRoot);
  } catch {
    fail(`--root does not exist: ${requestedRoot}`);
  }
  if (!fs.statSync(root).isDirectory()) fail(`--root is not a directory: ${requestedRoot}`);
  return { HOST: host, PORT: port, ROOT: root };
}

function fail(message) {
  console.error(`serve-static: ${message}\n${USAGE}`);
  process.exit(1);
}

function insideRoot(file) {
  return file === ROOT || file.startsWith(ROOT + path.sep);
}

function resolveRequest(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes("\0")) return { status: 400 };
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, relative);
  if (!insideRoot(resolved)) return { status: 403 };
  return { file: resolved };
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const { status, file } = resolveRequest(req.url || "/");
  if (status === 400) return sendText(res, 400, "bad request");
  if (status === 403) return sendText(res, 403, "forbidden");
  fs.realpath(file, (realpathError, realFile) => {
    if (realpathError) return sendText(res, 404, "not found");
    // A symlink inside ROOT must not expose a target outside ROOT.
    if (!insideRoot(realFile)) return sendText(res, 403, "forbidden");
    fs.readFile(realFile, (error, body) => {
      if (error) return sendText(res, 404, "not found");
      res.writeHead(200, { "content-type": TYPES.get(path.extname(file)) || "application/octet-stream" });
      res.end(body);
    });
  });
});

server.listen(PORT, HOST, () => {
  const { address, port } = server.address();
  console.log(`purpose-atlas-host http://${address.includes(":") ? `[${address}]` : address}:${port}/`);
});
