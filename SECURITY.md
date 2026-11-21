# Security policy

CrediFlow is a fictional educational simulator, not software approved for real lending or payments. Do not submit real personal or banking data.

Better Auth hashes passwords and manages HttpOnly, SameSite sessions; production enables Secure cookies. Session cache is disabled so revocation is checked against PostgreSQL. Registration cannot choose an administrator role. Credentials and authorization are checked server-side; email alone never authorizes an operation. Auth rate limits use the shared database.

All browser financial mutations require a matching Origin. Amounts come from stored products and installment records. The bank API requires a server-only bearer secret. Webhooks require HMAC-SHA256 over the raw body plus a five-minute timestamp window; current and previous signing keys support rotation. Duplicate inbox IDs are durable and conflicting payload reuse is rejected. Webhook processing confirms authoritative operation status over HTTP before financial posting.

The identity/BNPL and bank schemas use different PostgreSQL roles. The owner credential is for migrations and provisioning only and must not be supplied as a runtime database URL. Runtime credentials cannot alter the other domain. Financial entries, journals, bank outcomes and audit records reject mutation in PostgreSQL.

Secrets belong in environment settings or ignored local files. Never commit `.env`, `.local`, credentials, database files, browser storage state, or private demo access instructions. Demo administrator passwords must be supplied privately. Rotate production passwords independently from development.

Known scope limits: no public email-verification delivery, no MFA, no password-recovery email service, no external error-monitoring service, no formal penetration test, and no compliance certification. Dependency scanning is a tool result, not proof of security. Use private repository security reporting if enabled; do not post credentials in issues.
