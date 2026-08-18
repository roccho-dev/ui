import assert from "node:assert/strict";
import {
  MAX_URL_MODULE_CHARS,
  canonicalJson,
  createUrlModuleFieldsUrl,
  createUrlModuleUrl,
  decodeUrlModule,
  encodeUrlModule,
  readUrlModule,
  readUrlModuleToken,
  sha256Hex,
} from "../src/index.mjs";

const value = { schema: "proof/1", title: "URL module", pages: [{ id: "a", n: 1 }] };
const policy = { schema: "policy/1", tenant: "a" };
const token = await encodeUrlModule(value);
assert.match(token, /^[A-Za-z0-9_-]+$/u);
assert.deepEqual(await decodeUrlModule(token), value);
assert.equal(await encodeUrlModule(value), token);
const url = await createUrlModuleUrl({ base: "https://example.invalid/presentation/index.html?x=1", fragment: "presentation", value });
assert(url.startsWith("https://example.invalid/presentation/index.html?x=1#presentation="));
assert.deepEqual(await readUrlModule({ fragment: "presentation", input: url }), value);
assert.deepEqual(await readUrlModule({ fragment: "presentation", input: new URL(url).hash }), value);
assert.equal(await readUrlModule({ fragment: "presentation", input: "https://example.invalid/" }), null);
const multi = await createUrlModuleFieldsUrl({ base: "https://example.invalid/", fields: { policy, presentation: value } });
assert.deepEqual(await readUrlModule({ fragment: "presentation", input: multi }), value);
assert.deepEqual(await readUrlModule({ fragment: "policy", input: multi }), policy);
assert.equal(await readUrlModule({ fragment: "missing", input: multi }), null);
assert.equal(readUrlModuleToken({ fragment: "presentation", input: multi }), token);
assert.equal(canonicalJson({ z: 1, a: -0 }), '{"a":0,"z":1}');
assert.equal((await sha256Hex("proof")).length, 64);
assert.equal(await readUrlModule({ fragment: "presentation", input: "#other=eA" }), null);
await assert.rejects(readUrlModule({ fragment: "presentation", input: "#presentation=x&presentation=y" }), /duplicated/);
await assert.rejects(readUrlModule({ fragment: "presentation", input: "#Bad=x" }), /fragment name is invalid/);
await assert.rejects(readUrlModule({ fragment: "P", input: url }), /fragment name is invalid/);
await assert.rejects(decodeUrlModule("***"), /base64url/);
await assert.rejects(readUrlModule({ fragment: "presentation", input: `https://example.invalid/#presentation=${"a".repeat(MAX_URL_MODULE_CHARS)}` }), /URL exceeds/);
console.log("url-module-tests-pass 18");
