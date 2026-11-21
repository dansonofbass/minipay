import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { db } from './db';
import { appUrl } from './http';
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  return betterAuth({
    database: prismaAdapter(db(), { provider: 'postgresql' }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl(),
    trustedOrigins: [appUrl()],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: {
      additionalFields: { role: { type: 'string', defaultValue: 'CUSTOMER', input: false } },
    },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
    plugins: [nextCookies()],
  });
}
export function auth() {
  return (instance ??= createAuth());
}
