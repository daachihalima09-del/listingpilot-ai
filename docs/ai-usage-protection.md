# AI usage and abuse protection

ListingPilot applies server-side, workspace-scoped cost protection to the three merchant actions that call OpenAI:

- `PRODUCT_ANALYSIS`
- `LISTING_GENERATION`
- `SECTION_REGENERATION`

Shopify review/publishing, bulk publishing, image detection/import, metafield mapping/recommendations, page reads, and refreshes do not consume AI allowance.

## Accounting policy

An operation is reserved only after authentication, Product/workspace authorization, bounded request validation, and operation-specific eligibility checks. A rejected request before the provider boundary does not consume allowance. Once the provider boundary is entered, the operation counts for cost protection whether the provider succeeds, fails, times out, or returns malformed output. Internal provider retries are part of the same operation. A duplicate durable request ID never consumes a second operation while it is running or after provider work starts. An explicit merchant retry receives a new request ID and is accounted as a new operation.

The ledger stores identifiers, operation type, hashes, status, timestamps, attempt count, bounded error code, and provider request ID when available. It never stores prompts, source HTML, raw provider responses, secrets, or generated listing bodies.

## Atomicity and concurrency

Reservations use a serializable PostgreSQL transaction and a workspace advisory lock. Daily/monthly usage, workspace concurrency, stale leases, and request-key uniqueness are evaluated atomically. An active-key uniqueness constraint permits only one AI mutation at a time for a Product while still allowing unrelated Products up to the workspace concurrency limit.

Running operations have a five-minute default lease. A lease is longer than the bounded provider timeout/retry envelope. Expired rows are retained as `EXPIRED`, release their active key, and may be retried. If provider work had started, the expired operation remains counted for cost protection.

## Limits and overrides

Defaults for controlled early access:

- 25 AI operations per UTC day per workspace
- 300 AI operations per UTC calendar month per workspace
- 2 concurrent AI operations per workspace

Configure with:

- `AI_USAGE_LIMITS_ENABLED` (defaults to `true` in every environment)
- `AI_USAGE_DAILY_LIMIT`
- `AI_USAGE_MONTHLY_LIMIT`
- `AI_USAGE_MAX_CONCURRENT`
- `AI_USAGE_LEASE_SECONDS`
- `AI_USAGE_WORKSPACE_OVERRIDES`

`AI_USAGE_WORKSPACE_OVERRIDES` is a JSON object keyed by workspace UUID. Example shape: `{"10000000-0000-4000-8000-000000000001":{"daily":40,"monthly":500,"concurrent":2}}`. Keep deployment-specific workspace identifiers out of source control. Limits are disabled only by the explicit value `AI_USAGE_LIMITS_ENABLED=false`; development is not silently unlimited.

## Request throttling

The Postgres-backed rate-event ledger is separate from usage accounting. Defaults are:

- Sign-in: 10 attempts per normalized-email hash per 15 minutes
- Analysis principal guard: 30 requests per authenticated user per 10 minutes
- Product analysis: 10 requests per workspace per 10 minutes
- Listing generation: 10 requests per workspace per 10 minutes
- Section regeneration: 20 requests per workspace per 10 minutes
- Remote image import: 30 requests per authenticated user per 10 minutes

Maximums are configurable through the corresponding `RATE_LIMIT_<ACTION>_MAXIMUM` variables. Security thresholds are not sent to clients. Sign-in uses normalized-email hashing because a trustworthy client IP is not consistently available across every local/proxy deployment; no password or raw email is stored in the rate ledger.

## Merchant error codes

- `DAILY_AI_LIMIT_REACHED`
- `MONTHLY_AI_LIMIT_REACHED`
- `AI_CONCURRENCY_LIMIT_REACHED`
- `AI_OPERATION_ALREADY_RUNNING`
- `AI_OPERATION_ALREADY_COMPLETED`
- `REQUEST_RATE_LIMITED`

Responses use `429` for allowance/rate/concurrency throttling and `409` for duplicate-operation conflicts. Retry timing is exposed only when useful; internal thresholds and database details are not.

## Provider configuration

The shared OpenAI Responses client centralizes `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, and `OPENAI_MAXIMUM_ATTEMPTS`. Output-token bounds remain operation-specific. Provider request IDs may be stored; prompts and raw responses may not.
