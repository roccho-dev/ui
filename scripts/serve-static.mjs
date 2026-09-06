import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRegistryRequestHandler } from "./registry-dev-routes.mjs";

const HOST = "127.0.0.1";
const PORT = 18083;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${HOST}:${PORT}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) return null;
  return resolved;
}

export function createStaticServer() {
  const handleRegistryRequest = createRegistryRequestHandler();
  return http.createServer((req, res) => {
    if (handleRegistryRequest(req, res)) return;
    const file = resolveRequest(req.url || "/");
    if (!file) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES.get(path.extname(file)) || "application/octet-stream" });
      res.end(body);
    });
  });
}

export function startStaticServer({ host = HOST, port = PORT } = {}) {
  const server = createStaticServer();
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`purpose-atlas-host http://${host}:${address.port}/`);
  });
  return server;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  startStaticServer();
}
