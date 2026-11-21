import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const token = () => randomBytes(32).toString('hex');
await writeFile(
  '.env',
  `MIGRATION_DATABASE_URL=postgresql://postgres:ci_database_password@localhost:5432/crediflow\nDATABASE_URL=postgresql://crediflow_bnpl:${token()}@localhost:5432/crediflow\nBANK_DATABASE_URL=postgresql://crediflow_bank:${token()}@localhost:5432/crediflow\nBETTER_AUTH_SECRET=${token()}\nBANK_SERVICE_SECRET=${token()}\nWEBHOOK_SECRET=${token()}\nCRON_SECRET=${token()}\nDEMO_PASSWORD=${token()}\nAPP_URL=http://localhost:3000\nBETTER_AUTH_URL=http://localhost:3000\n`,
  { flag: 'wx' },
);
console.log('Isolated CI environment written; no secret values emitted.');
