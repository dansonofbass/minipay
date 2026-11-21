# HTTP contracts

The OpenAPI 3.1 document is served at `/api/openapi`; source is `src/lib/openapi.ts`. It describes customer/admin action payloads, role requirements, monetary semantics, bank account snapshots, credit reserve/commit/release, payments, status inquiries and signed webhook receipt. Better Auth exposes its maintained `/api/auth/*` contracts separately.

Application endpoints return `{data, requestId}` or `{error:{code,message},requestId}`. Whole AMD amounts are decimal strings. Bank business declines are processed outcomes with status `DECLINED`; transport errors use HTTP 503/504 and do not prove absence of a financial commit. Preserve the original ID and inquire.

`/api/internal/tick`, bank outbox/integrity/control endpoints and the Vercel Queues callback are operational contracts, not customer APIs. They require service/scheduler authentication or the managed callback verification mechanism. No bank bearer secret is delivered to browsers.
