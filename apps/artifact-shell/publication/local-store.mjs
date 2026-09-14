export const installLocalStore = async ({ contentType, href }) => {
  if (typeof contentType !== "string" || !contentType) throw new Error("local-store: contentType required");
  const originalFetch = globalThis.fetch.bind(globalThis);
  const target = new URL(href, globalThis.location.href);
  if (target.origin !== globalThis.location.origin) throw new Error("local-store: same-origin href required");
  const initial = await originalFetch(target.href, { cache: "no-store", credentials: "omit" });
  if (!initial.ok) throw new Error(`local-store: initial GET returned ${initial.status}`);
  let body = await initial.text();
  let revision = 1;
  let etag = `"local-${revision}"`;
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url, globalThis.location.href);
    if (requestUrl.href !== target.href) return originalFetch(input, init);
    const requestMethod = String(init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    if (requestMethod === "GET") return new Response(body, { status: 200, headers: { "Content-Type": contentType, ETag: etag } });
    if (requestMethod !== "PUT") return new Response("method not allowed", { status: 405 });
    const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
    if (headers.get("If-Match") !== etag) return new Response("stale", { status: 412, headers: { ETag: etag } });
    body = String(init.body ?? "");
    revision += 1;
    etag = `"local-${revision}"`;
    return new Response(JSON.stringify({ etag }), { status: 200, headers: { "Content-Type": "application/json", ETag: etag } });
  };
  return Object.freeze({ etag: () => etag, href: target.href, read: () => body });
};
