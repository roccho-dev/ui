# ADRS authenticated decision view

Read-only adapter for `ui#168` / `adrs#318`.

- `/decisions/<type>/<status>` selects an explicit manifest route.
- same-origin protected data uses the existing session (`credentials: include`).
- cross-origin data never receives ambient credentials (`credentials: omit`).
- redirects, 401/403, wrong content type, oversized bytes, digest/schema/type/status mismatch, and unknown renderer fail closed.
- rendering is injected through the existing renderer registry; this package creates no second renderer or decision authority.

```sh
node --test packages/adrs318-decision-view/tests/test.mjs
```
