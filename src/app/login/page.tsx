import Link from 'next/link';
import { Layers3, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
export default function Login() {
  return (
    <main className="login-page">
      <section className="login-story">
        <Link className="brand" href="/">
          <Layers3 />
          CrediFlow
        </Link>
        <div>
          <span className="eyebrow">YOUR WORLD OF POSSIBILITIES</span>
          <h1>
            A little now.
            <br />A little later.
          </h1>
          <p>Explore a better way to pay, with complete visibility into every fictional dram.</p>
        </div>
        <span className="fine-print">
          <ShieldCheck size={18} /> Fictional finances. Secure by design.
        </span>
      </section>
      <section className="login-panel">
        <span className="eyebrow">WELCOME TO CREDIFLOW</span>
        <h2>Your next chapter starts here.</h2>
        <p className="muted">Sign in to your dedicated portal.</p>
        <LoginForm
          configured={Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET)}
        />
        <Link className="subtle-link" href="/">
          Back to CrediFlow
        </Link>
      </section>
    </main>
  );
}
