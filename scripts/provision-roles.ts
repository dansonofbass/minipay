import 'dotenv/config';
import { Client } from 'pg';
const owner = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await owner.connect();
for (const [name, key] of [
  ['crediflow_bnpl', 'DATABASE_URL'],
  ['crediflow_bank', 'BANK_DATABASE_URL'],
]) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  const url = new URL(value);
  if (url.username !== name) throw new Error(`Runtime username must match ${name}`);
  if (!/^[a-zA-Z0-9_-]{24,}$/.test(url.password))
    throw new Error('Use a generated role password of at least 24 URL-safe characters');
  if (!(await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount)
    await owner.query(`CREATE ROLE ${name} LOGIN PASSWORD '${url.password}'`);
}
await owner.end();
console.log('Runtime roles exist; existing passwords were not changed.');
