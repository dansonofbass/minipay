import EmbeddedPostgres from 'embedded-postgres';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const directory = path.resolve('.local');
await mkdir(directory, { recursive: true });
const envPath = path.resolve('.env');
let env;
try {
  env = await readFile(envPath, 'utf8');
} catch {
  const password = randomBytes(24).toString('hex'),
    bnpl = randomBytes(24).toString('hex'),
    bank = randomBytes(24).toString('hex'),
    demo = randomBytes(18).toString('base64url');
  const origin = 'http://localhost:3000';
  env = `MIGRATION_DATABASE_URL=postgresql://postgres:${password}@localhost:55432/crediflow\nDATABASE_URL=postgresql://crediflow_bnpl:${bnpl}@localhost:55432/crediflow\nBANK_DATABASE_URL=postgresql://crediflow_bank:${bank}@localhost:55432/crediflow\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nBETTER_AUTH_URL=${origin}\nAPP_URL=${origin}\nBANK_SERVICE_SECRET=${randomBytes(32).toString('hex')}\nWEBHOOK_SECRET=${randomBytes(32).toString('hex')}\nCRON_SECRET=${randomBytes(32).toString('hex')}\nDEMO_PASSWORD=${demo}\n`;
  await writeFile(envPath, env, { flag: 'wx' });
  await writeFile(
    path.join(directory, 'demo-access.txt'),
    `LOCAL FICTIONAL DEMO ONLY\nPassword for seeded accounts: ${demo}\n\nCustomer: alice@crediflow.demo\nBNPL admin: admin@crediflow.demo\nBank admin: bank@crediflow.demo\nOther customers: bob, charlie, diana, edward @crediflow.demo\nKeep this file private. Production uses separate credentials.\n`,
  );
}
for (const line of env.split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const url = new URL(process.env.MIGRATION_DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local database helper refuses remote database URLs');
const pg = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'postgres'),
  port: 55432,
  user: 'postgres',
  password: url.password,
  persistent: true,
  autoRehydrateSymlinks: true,
  authMethod: 'scram-sha-256',
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});
try {
  await readFile(path.join(directory, 'postgres', 'PG_VERSION'));
} catch {
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='crediflow'")).rowCount)
  await client.query('CREATE DATABASE crediflow');
for (const [name, key] of [
  ['crediflow_bnpl', 'DATABASE_URL'],
  ['crediflow_bank', 'BANK_DATABASE_URL'],
]) {
  const password = new URL(process.env[key]).password;
  if (!/^[a-f0-9]+$/.test(password)) throw new Error('Unexpected local role password format');
  if (!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount)
    await client.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
}
await client.end();
console.log(
  'Local PostgreSQL is running on port 55432. Credentials are in ignored .env; demo access is in .local/demo-access.txt.',
);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise(() => {});
