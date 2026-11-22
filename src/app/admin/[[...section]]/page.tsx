import { portalUser } from '@/lib/access';
import { Operations } from '@/components/operations';
import { Portal } from '@/components/portal';
export default async function Admin({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await portalUser('BNPL_ADMIN');
  const section = (await params).section ?? [];
  if (section[0] === 'operations')
    return (
      <Operations
        key={section[1]}
        section={section[1] ?? 'overview'}
        initialQuery={(await searchParams).q ?? ''}
      />
    );
  return (
    <Portal
      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      section={(await params).section ?? []}
    />
  );
}
