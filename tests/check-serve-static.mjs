import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repo, "scripts", "serve-static.mjs");
const children = [];

// Raw paths are sent as-is; fetch() would normalize "/../" before the server sees it.
function get(host, port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path: rawPath, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function start(args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const match = out.match(/purpose-atlas-host http:\/\/([^/]+):(\d+)\//);
      if (match) resolve({ host: match[1], port: Number(match[2]) });
    });
    child.on("exit", (code) => reject(new Error(`server exited early with ${code}`)));
  });
}

function exitCode(args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
  children.push(child);
  return new Promise((resolve) => child.on("exit", (code) => resolve(code)));
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.on("exit", () => resolve());
    child.kill();
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "serve-static-"));
const root = path.join(tmp, "root");
const outside = path.join(tmp, "outside.txt");
const created = [];
const track = (file) => { created.unshift(file); return file; };

try {
  fs.mkdirSync(track(root));
  fs.writeFileSync(track(outside), "outside-secret\n");
  fs.writeFileSync(track(path.join(root, "index.html")), "<!doctype html><title>atlas</title>\n");
  fs.writeFileSync(track(path.join(root, "data.jsonl")), "{\"id\":1}\n");
  fs.symlinkSync(outside, track(path.join(root, "escape.txt")));
  fs.symlinkSync(path.join(root, "index.html"), track(path.join(root, "alias.html")));

  const artifact = await start(["--port", "0", "--root", root]);
  assert.equal(artifact.host, "127.0.0.1", "default host stays loopback");
  const at = (rawPath) => get(artifact.host, artifact.port, rawPath);

  let res = await at("/");
  assert.equal(res.status, 200);
  assert.match(res.type, /^text\/html/);
  assert.match(res.body, /<title>atlas<\/title>/);
  assert.equal((await at("/index.html?view=responsibility")).status, 200);
  res = await at("/data.jsonl");
  assert.equal(res.status, 200);
  assert.match(res.type, /^application\/x-ndjson/);
  assert.equal((await at("/alias.html")).status, 200, "symlink inside root is served");
  assert.equal((await at("/missing.html")).status, 404);

  // URL parsing folds dot segments, so these stay inside root and the file is absent there.
  for (const rawPath of ["/../outside.txt", "/%2e%2e/outside.txt", "/../package.json"]) {
    res = await at(rawPath);
    assert.equal(res.status, 404, rawPath);
    assert.doesNotMatch(res.body, /outside-secret/);
  }
  // Encoded slashes survive URL parsing and decode to a real escape.
  for (const rawPath of ["/%2e%2e%2foutside.txt", "/..%2foutside.txt", "/escape.txt"]) {
    res = await at(rawPath);
    assert.equal(res.status, 403, rawPath);
    assert.doesNotMatch(res.body, /outside-secret/);
  }
  for (const rawPath of ["/%E0", "/a%00b"]) assert.equal((await at(rawPath)).status, 400, rawPath);
  assert.equal((await at("/")).status, 200, "server stays alive after bad requests");

  const repoRoot = await start(["--host=127.0.0.1", "--port=0"]);
  res = await get(repoRoot.host, repoRoot.port, "/package.json");
  assert.equal(res.status, 200, "default root stays the repository root");
  assert.equal(JSON.parse(res.body).name, "ui");

  for (const args of [
    ["--root", path.join(tmp, "absent")],
    ["--root", path.join(root, "index.html")],
    ["--root", ""],
    ["--port", "70000"],
    ["--port", "abc"],
    ["--host", ""],
    ["--unknown", "x"],
    ["positional"],
  ]) {
    assert.notEqual(await exitCode(args), 0, args.join(" "));
  }
} finally {
  await Promise.all(children.map(stop));
  for (const file of created) {
    try {
      if (file === root) fs.rmdirSync(file);
      else fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  fs.rmdirSync(tmp);
}

console.log(JSON.stringify({ status: "serve-static-check-pass" }, null, 2));
