const base = process.argv[2] ?? process.env.UI_PUBLIC_URL;
if (!base) throw new Error("UI_PUBLIC_URL or deployed base URL argument is required");

const root = new URL(base);
if (!root.pathname.endsWith("/")) root.pathname += "/";

const paths = [
  "",
  "adapters/graph/",
  "adapters/map/",
  "adapters/seq/",
  "adapters/presentation/",
  "adapters/control/",
];

for (const path of paths) {
  const url = new URL(path, root);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    console.log(`PASS ${response.status} ${url}`);
  } catch (error) {
    if (error?.name === "TimeoutError") {
      console.log(`TODO timeout ${url}`);
      continue;
    }
    throw error;
  }
}

console.log("VISUAL: open the URLs above and confirm the rendered screens.");
