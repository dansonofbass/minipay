import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { invariant } from './http';
import { tracing } from '@/modules/observability/context';
export type Role = 'CUSTOMER' | 'BNPL_ADMIN' | 'BANK_ADMIN';
export async function requireUser(role?: Role, requestHeaders?: Headers) {
  const session = await auth().api.getSession({ headers: requestHeaders ?? (await headers()) });
  invariant(session, 'UNAUTHENTICATED', 'Please sign in', 401);
  const context = tracing.getStore();
  if (context) context.actorId = session.user.id;
  invariant(
    !role || session.user.role === role,
    'FORBIDDEN',
    'This portal requires a different role',
    403,
  );
  return session.user;
}
export async function portalUser(role: Role) {
  if (!process.env.DATABASE_URL) redirect('/login?setup=required');
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (session.user.role !== role)
    redirect(
      session.user.role === 'BANK_ADMIN'
        ? '/bank'
        : session.user.role === 'BNPL_ADMIN'
          ? '/admin'
          : '/app',
    );
  return session.user;
}
