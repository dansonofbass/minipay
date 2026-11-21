# Developer contribution guide

Normal users follow the browser walkthrough; these instructions are for maintainers and automated engineering environments.

Use Node.js 24 and the committed npm lockfile. Install with `npm ci`; generate the Prisma client with `npm run db:generate`. `.env.example` documents environment keys without credentials.

For isolated development, `npm run local:db` creates a real local PostgreSQL cluster and private `.env` values on first use. It never substitutes for a managed production database. Apply migrations with `npm run db:migrate`, grant restricted runtime roles with `npm run db:grants`, and run `npm run db:seed`. Start the application with `npm run dev` and the independent local HTTP worker with `npm run local:worker`. Existing seeds do not overwrite balances or reset production data.

Run `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, and `npm run build` as appropriate. Integration and browser tests require the running application and PostgreSQL; do not run the periodic worker concurrently with failure-checkpoint integration assertions. CI provisions a clean PostgreSQL service and runs the same boundaries.

Keep domain logic outside React. Bank state changes must pass through authenticated HTTP endpoints. Do not hold database transactions open across HTTP requests. Preserve operation IDs and canonical request hashes across retries. Add a migration when constraints or schema change; never edit applied migrations. Do not reset shared data to make tests pass.

Use meaningful commits and include test evidence plus remaining limitations in pull requests. Screenshot artifacts must use fictional data only. Review all staged files for secrets before publishing.
