# Shopify GraphQL and compliance operations

ListingPilot production code uses the versioned Shopify GraphQL Admin API only. `SHOPIFY_API_VERSION` is the single runtime version setting; update and test it on Shopify's quarterly stable-version cadence. OAuth token exchange remains Shopify's unversioned OAuth endpoint and is not an Admin REST call.

## Admin API and identity

- OAuth verifies the installed shop with the GraphQL `shop` query and checks the returned `myshopifyDomain` against the signed callback shop.
- Product reads and writes use exact `gid://shopify/Product/...` identities. Legacy numeric IDs remain only as a compatibility projection for existing persisted links and are cross-checked against the GID.
- Generic direct Product create/update endpoints are retired. Shopify mutations must go through the existing Safe Publishing confirmation, linkage, freshness, and idempotency controls.
- Required scopes remain centralized in `SHOPIFY_SCOPES`. The OAuth callback rejects grants missing any requested scope.

## HTTPS webhook endpoints

| Purpose | Endpoint | Topic(s) |
| --- | --- | --- |
| Uninstall | `/api/shopify/webhooks/app-uninstalled` | `app/uninstalled` |
| Mandatory privacy compliance | `/api/shopify/webhooks/compliance` | `customers/data_request`, `customers/redact`, `shop/redact` |

Both endpoints read a bounded raw body and validate `X-Shopify-Hmac-Sha256` with the server-only Shopify API secret before mutation. The compliance endpoint also validates the topic, webhook ID, normalized shop domain, JSON shape, and payload/header shop consistency.

Compliance deliveries are recorded without the raw customer payload. The durable AuditLog record stores the delivery ID, topic, shop identity, API version, event ID, trigger time, and a SHA-256 payload hash. A PostgreSQL transaction advisory lock keyed by `X-Shopify-Webhook-Id` makes duplicate delivery processing idempotent without a schema change.

ListingPilot stores no Shopify customer or order data. `customers/data_request` and `customers/redact` are therefore acknowledged and recorded as no-customer-data operations. `shop/redact` immediately ensures the matched Shopify credential is disconnected, but does not silently delete merchant-created ListingPilot catalog content. The retention/deletion treatment for Product Truth, listings, images, publishing history, and audit records requires an approved legal/product policy before public distribution.

## Shopify configuration

This repository does not currently contain a Shopify CLI `shopify.app.toml`, so webhook subscriptions are external configuration. Before shared/public distribution, create a new app version in Shopify Dev Dashboard (or introduce and deploy an authoritative CLI app configuration) with:

1. Webhook API version equal to the supported stable `SHOPIFY_API_VERSION`.
2. `customers/data_request`, `customers/redact`, and `shop/redact` delivered to the public HTTPS compliance endpoint above.
3. `app/uninstalled` delivered to the uninstall endpoint above.
4. Application URL and allowed OAuth redirect URL matching `SHOPIFY_APP_URL` and `/api/shopify/callback`.
5. Scopes matching `SHOPIFY_SCOPES` exactly.

Release the Shopify app configuration version, then use Shopify CLI webhook triggers for each topic against a non-production test environment. Confirm valid deliveries return 200, invalid HMAC returns 401, duplicate delivery IDs do not add duplicate audit events, uninstall clears the encrypted token, and no Product mutation occurs.
