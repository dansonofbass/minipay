import { portalUser } from '@/lib/access';
import { Portal } from '@/components/portal';
export default async function Admin({ params }: { params: Promise<{ section?: string[] }> }) {
  const user = await portalUser('BNPL_ADMIN');
  return (
    <Portal
      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      section={(await params).section ?? []}
    />
  );
}
