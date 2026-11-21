import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await client.connect();
await client.query(`
  REVOKE ALL ON SCHEMA bank FROM PUBLIC;
  REVOKE ALL ON SCHEMA bnpl FROM PUBLIC;
  REVOKE ALL ON SCHEMA identity FROM PUBLIC;
  GRANT USAGE ON SCHEMA identity,bnpl TO crediflow_bnpl;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity,bnpl TO crediflow_bnpl;
  GRANT USAGE ON SCHEMA bank TO crediflow_bank;
  GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA bank TO crediflow_bank;
  REVOKE UPDATE,DELETE ON bnpl."Journal",bnpl."Entry",bnpl."Audit" FROM crediflow_bnpl;
  REVOKE UPDATE,DELETE ON bank."BankJournal",bank."BankEntry",bank."BankOperation",bank."SimulationLog" FROM crediflow_bank;
`);
await client.end();
console.log('Schema-specific runtime grants applied.');
