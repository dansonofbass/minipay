# Logging architecture

## Four storage classes

1. Durable business events: domain-local `OperationEvent`, appended by transaction-bound PostgreSQL triggers, retained without automatic deletion.
2. Financial audit: existing `bnpl.Audit` plus `bank.Audit`, retained without automatic deletion and protected by permissions and mutation triggers.
3. Application diagnostics: domain-local `TechnicalLog`, metadata allowlist, no arbitrary payloads or credentials. No durable DEBUG stream is enabled.
4. Technical traces and metrics: request/trace IDs plus observed HTTP timing in technical logs. An external OpenTelemetry collector is not configured; no external span coverage is claimed.

`ErrorReview` stores current acknowledgment/resolution and a note. Every review also appends an audit record so replacing a current note does not erase review history. Errors are grouped from persisted occurrences rather than synthesized successful/failed counts. They never auto-resolve due to inactivity.

## Retention and performance

Worker ticks delete at most 1,000 technical rows older than 30 days per domain. If the scheduler stops, cleanup is delayed; technical retention is a target, not a guaranteed hard storage cap. Durable financial events, simulation records and audits are not purged. A production legal retention/archive policy and external high-volume log sink remain future work. Noncritical exporter failure does not modify financial state.

Indexes cover correlation, operation, timestamp, type, severity and actor; technical logs cover code and time. Queries are parameterized and use a fixed table allowlist. Pages contain 1?100 rows, at most 100 pages, and require bounded date ranges. A cross-domain page fetches bounded candidates using separate restricted credentials, then merges by timestamp and ID. Child histories are bounded; very large histories may require an event-page investigation. The Error Center bounds durable groups to 1,000 per domain.

Operational responses omit raw payloads, credential fields, lease tokens and arbitrary database/worker exception text. Configured secrets and connection strings are redacted recursively from free text. Simulation configuration is schema-validated numeric/boolean data. Export cells are quoted and dangerous formula prefixes escaped.

## Schema changes

Migrations 6?8 add event/technical tables, bank audit, error reviews, identity event capture and diagnostic indexes. Existing business tables retain their economic identifiers and constraints. There is no duplicate operation-timeline table: timelines query real events linked to original records. Normal runtime credentials cannot insert synthetic durable events; only the transactional trigger writers can append them.

## Release gate

`db:release` applies migrations, applies schema-specific runtime grants, then verifies zero Prisma drift. It uses an externally supplied migration credential, never seeds or resets financial records, and stops on the first failed check. Production credentials are not added to the repository or hosted runtime. The current production release requires explicit approval following automatic review rejection; see the implementation status.
