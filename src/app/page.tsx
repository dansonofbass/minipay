import Link from 'next/link';
import { ArrowUpRight, Layers3, ShieldCheck, Landmark, WalletCards } from 'lucide-react';
export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <Layers3 />
          CrediFlow<span>SIMULATOR</span>
        </Link>
        <Link className="button secondary" href="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </nav>
      <div className="landing-hero">
        <span className="eyebrow">A FINANCIAL SYSTEM YOU CAN EXPLORE</span>
        <h1>
          Good things.
          <br />
          <span>At your own pace.</span>
        </h1>
        <p>
          Shop in interest-free installments. Explore the banking behind every payment. All in one
          fictional financial world.
        </p>
        <Link className="button" href="/app">
          Open customer portal <ArrowUpRight size={18} />
        </Link>
        <div className="fine-print">
          <ShieldCheck size={16} /> No real money. No real banks. Just real engineering.
        </div>
      </div>
      <div className="portal-cards">
        {[
          {
            icon: WalletCards,
            title: 'Your next purchase',
            description: 'Browse the catalog, request a plan, and manage your installments.',
            href: '/app',
            label: 'Customer portal',
          },
          {
            icon: Layers3,
            title: 'The full picture',
            description: 'Review requests, trace payments, and reconcile financial outcomes.',
            href: '/admin',
            label: 'BNPL administration',
          },
          {
            icon: Landmark,
            title: 'Behind the balance',
            description: 'Manage fictional accounts and put payment reliability to the test.',
            href: '/bank',
            label: 'Mock Bank console',
          },
        ].map((c) => (
          <Link className="portal-card" href={c.href} key={c.href}>
            <c.icon />
            <span className="eyebrow">{c.label}</span>
            <h2>{c.title}</h2>
            <p>{c.description}</p>
            <ArrowUpRight className="corner" />
          </Link>
        ))}
      </div>
      <footer>
        CrediFlow · A fictional BNPL & banking simulator{' '}
        <span>AMD · 0% interest · 4 or 6 installments</span>
      </footer>
    </main>
  );
}
