const base = process.argv[2] ?? process.env.UI_PUBLIC_URL;
if (!base) throw new Error("UI_PUBLIC_URL or deployed base URL argument is required");

const root = new URL(base);
if (!root.pathname.endsWith("/")) root.pathname += "/";
const get = async relative => {
  const url = new URL(relative, root);
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
};

await get("");
const catalog = await (await get("catalog.json")).json();
if (catalog?.schema !== "artifact-capability-catalog/2") throw new Error("unsupported capability catalog");
if (!Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) throw new Error("capability catalog is empty");

for (const entry of catalog.capabilities) {
  const release = `${entry.root}/`;
  const publication = await (await get(`${release}manifest.json`)).json();
  if (publication?.releaseHash !== entry.releaseHash) throw new Error(`${entry.root}: release hash mismatch`);
  await get(`${release}agent.json`);
  await get(`${release}engine.mjs`);
  await get(`${release}${publication.human.href}`);
  console.log(`PASS ${entry.capability.id}@${entry.capability.version}`);
}

console.log(JSON.stringify({ schema: "artifact-shell-publication-smoke/1", status: "PASS", capabilities: catalog.capabilities.length }));
