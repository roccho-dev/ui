import assert from "node:assert/strict";
import { validateArtifactReference } from "../src/index.mjs";

const reference = { schema: "artifact-reference/1", href: "https://artifacts.example.test/a.json", mediaType: "application/json", bytes: 10, sha256: "a".repeat(64) };
assert.equal(validateArtifactReference(reference).bytes, 10);
assert.equal(validateArtifactReference({ ...reference, href: "./a.json" }).href, "./a.json");
assert.throws(() => validateArtifactReference({ ...reference, href: "http://example.test/a.json" }), /relative or https/);
assert.throws(() => validateArtifactReference({ ...reference, href: "//evil.test/a.json" }), /scheme-relative/);
assert.throws(() => validateArtifactReference({ ...reference, href: "\\evil.test\\a.json" }), /backslashes/);
assert.throws(() => validateArtifactReference({ ...reference, bytes: 0 }), /bytes/);
assert.throws(() => validateArtifactReference({ ...reference, sha256: "A".repeat(64) }), /lowercase hex/);
assert.throws(() => validateArtifactReference({ ...reference, mediaType: "text/html" }), /application\/json/);
console.log("artifact-reference-tests-pass 8");
