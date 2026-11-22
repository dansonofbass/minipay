import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const target = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
if (process.argv.includes('--production') && ['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('Production release refuses a local database target');
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['node_modules/tsx/dist/cli.mjs', 'scripts/grant-roles.ts'],
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--exit-code',
  ],
]) {
  // The schema engine uses Prisma TLS names; pg runtime connections retain verify-full.
  const migrationTarget = new URL(target);
  if (migrationTarget.searchParams.get('sslmode') === 'verify-full') {
    migrationTarget.searchParams.set('sslmode', 'require');
    migrationTarget.searchParams.set('sslaccept', 'strict');
  }
  const env = args[0].includes('prisma/')
    ? { ...process.env, MIGRATION_DATABASE_URL: migrationTarget.toString() }
    : process.env;
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  'Release migration, runtime grants and schema gate passed. No seed or financial reset performed.',
);
