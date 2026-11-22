'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  Armchair,
  ArrowDownLeft,
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Headphones,
  Landmark,
  Laptop,
  Layers3,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Users,
  WalletCards,
  Watch,
  Webhook,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
import { defaults, scenarios, type simulatorSchema } from '@/modules/banking/simulator';
import { schedule } from '@/modules/installments/schedule';
import type { z } from 'zod';
type User = { id: string; name: string; email: string; role: string };
type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  stock: number;
  icon: string;
};
type Installment = {
  id: string;
  number: number;
  amount: string;
  status: string;
  dueAt: string;
  paidAt: string | null;
};
type Purchase = {
  id: string;
  customerId: string;
  customer: { name: string; email: string };
  total: string;
  count: number;
  status: string;
  reason: string | null;
  bankCheck: Record<string, unknown> | null;
  items: { name: string; quantity: number }[];
  installments: Installment[];
  createdAt: string;
};
type Account = {
  id: string;
  name: string;
  number: string;
  cash: string;
  creditLimit: string;
  used: string;
  reserved: string;
  status: string;
};
type Payment = {
  id: string;
  installmentId: string;
  amount: string;
  status: string;
  attempt: number;
  lastError: string | null;
  createdAt: string;
};
type Job = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  error: string | null;
  reference: string;
};
type Event = { id: string; type: string; status: string; attempts: number; operationId: string };
type PortalData = {
  cart?: { productId: string; quantity: number }[];
  products?: Product[];
  purchases?: Purchase[];
  payments?: Payment[];
  jobs?: Job[];
  audit?: unknown[];
  inbox?: unknown[];
  reconciliations?: unknown[];
  customers?: unknown[];
  journals?: unknown[];
  accounts?: Account[];
  operations?: unknown[];
  reservations?: unknown[];
  events?: Event[];
  deliveries?: unknown[];
  logs?: unknown[];
  settings?: {
    config: z.infer<typeof simulatorSchema>;
    nextScenario: string | null;
    version?: number;
  };
  link?: unknown;
  account?: Account | null;
  bankError?: string | null;
};
type Action = (body: Record<string, unknown>) => Promise<boolean>;
const money = (value: string | bigint | number) =>
  `${new Intl.NumberFormat('en-US').format(BigInt(value))} ֏`;
const readable = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Yerevan',
  });
function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${['ACTIVE', 'SUCCEEDED', 'PAID', 'DELIVERED', 'DONE', 'MATCHED', 'APPROVED_AWAITING_PAYMENT'].includes(value) ? 'good' : ['FAILED', 'DECLINED', 'REJECTED', 'DEAD', 'FROZEN'].includes(value) ? 'bad' : 'waiting'}`}
    >
      {readable(value)}
    </span>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon = WalletCards,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: typeof WalletCards;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Package size={30} />
      <p>{children}</p>
    </div>
  );
}
function Records({ rows, title }: { rows: unknown[]; title?: string }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title ?? 'Operation records'}</h2>
        <span className="muted">{rows.length} records</span>
      </div>
      {rows.length ? (
        <div className="record-list">
          {rows.map((row, index) => {
            const r = row as Record<string, unknown>;
            return (
              <details key={String(r.id ?? index)}>
                <summary>
                  <code>{String(r.id ?? r.reference ?? index)}</code>
                  <span>{String(r.action ?? r.kind ?? r.type ?? r.name ?? 'Record')}</span>
                  {typeof r.status === 'string' && <Status value={r.status} />}
                  <ChevronRight size={16} />
                </summary>
                <pre>{JSON.stringify(row, null, 2)}</pre>
              </details>
            );
          })}
        </div>
      ) : (
        <Empty>No records yet. New activity will appear here.</Empty>
      )}
    </section>
  );
}
const customerNav = [
  ['', 'Overview', LayoutDashboard],
  ['catalog', 'Explore products', ShoppingBag],
  ['requests', 'My requests', Layers3],
  ['installments', 'My installments', CreditCard],
  ['payments', 'Payment history', Activity],
] as const;
const adminNav = [
  ['operations', 'Operations center', Activity],
  ['', 'Overview', LayoutDashboard],
  ['requests', 'Purchase requests', Layers3],
  ['customers', 'Customers', Users],
  ['orders', 'Orders', ShoppingBag],
  ['installments', 'Installments', CreditCard],
  ['payments', 'Payments', WalletCards],
  ['bank-checks', 'Bank checks', Landmark],
  ['transactions', 'Transactions', Activity],
  ['reconciliation', 'Reconciliation', RefreshCw],
  ['workers', 'Background jobs', Settings2],
  ['webhooks', 'Webhooks', Webhook],
  ['audit-logs', 'Audit trail', ShieldCheck],
  ['settings', 'Settings', Settings2],
] as const;
const bankNav = [
  ['', 'Overview', LayoutDashboard],
  ['accounts', 'Bank accounts', WalletCards],
  ['credit', 'Credit & reservations', CreditCard],
  ['transactions', 'Transactions', Activity],
  ['simulator', 'Bank simulator', Settings2],
  ['webhooks', 'Webhook delivery', Webhook],
  ['logs', 'Operational logs', BookOpen],
  ['settings', 'Settings', Settings2],
] as const;

export function Portal({ user, section }: { user: User; section: string[] }) {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const page = section[0] ?? '',
    isBank = user.role === 'BANK_ADMIN',
    isAdmin = user.role === 'BNPL_ADMIN',
    root = isBank ? '/bank' : isAdmin ? '/admin' : '/app';
  const nav = isBank ? bankNav : isAdmin ? adminNav : customerNav;
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/portal', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Unable to load portal');
      setData(result.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function initialLoad() {
      try {
        const response = await fetch('/api/portal', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? 'Unable to load portal');
        setData(result.data);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load');
      }
    }
    void initialLoad();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  const act: Action = async (body) => {
    if (
      ['RECONCILE', 'RETRY_JOB', 'REPLAY_WEBHOOK'].includes(String(body.action)) &&
      !window.confirm('Confirm this audited recovery action using the original operation ID?')
    )
      return false;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          ...(['RECONCILE', 'RETRY_JOB', 'REPLAY_WEBHOOK'].includes(String(body.action))
            ? { confirmed: true }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Operation failed');
      setNotice(
        'Saved. Financial work is processed durably; pending status will update automatically.',
      );
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Operation failed');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const title =
    nav.find((n) => n[0] === page)?.[1] ??
    (page === 'products' ? 'Product details' : 'Page not found');
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={root}>
          <Layers3 />
          CrediFlow
        </Link>
        <div className="workspace-tag">
          <span className="workspace-icon">
            {isBank ? (
              <Landmark size={18} />
            ) : isAdmin ? (
              <ShieldCheck size={18} />
            ) : (
              <WalletCards size={18} />
            )}
          </span>
          <div>
            <strong>
              {isBank ? 'Mock Bank' : isAdmin ? 'BNPL Operations' : 'Personal account'}
            </strong>
            <span>Fictional finance workspace</span>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <Link
              className={page === path ? 'nav-link active' : 'nav-link'}
              href={`${root}/${path}`}
              key={path}
            >
              <Icon size={19} />
              {label}
              {path === 'requests' &&
                Boolean(data?.purchases?.filter((p) => p.status === 'PENDING_REVIEW').length) && (
                  <span className="nav-count">
                    {data?.purchases?.filter((p) => p.status === 'PENDING_REVIEW').length}
                  </span>
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="simulation-card">
            <ShieldCheck size={20} />
            <strong>A safe place to explore</strong>
            <p>Every account and transaction is fictional. No real money moves.</p>
          </div>
          <Link className="nav-link" href="/">
            <CircleHelp size={18} />
            About CrediFlow
          </Link>
          <button
            className="nav-link"
            onClick={async () => {
              await authClient.signOut();
              router.push('/login');
              router.refresh();
            }}
          >
            <LogOut size={18} />
            Sign out
          </button>
          <div className="identity">
            <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{user.name}</strong>
              <span>{readable(user.role)}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            {isBank ? 'Bank console' : isAdmin ? 'Administration' : 'My account'}
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <ShieldCheck size={14} />
              FICTIONAL DEMO
            </span>
            <button className="icon-button" aria-label="Refresh portal" onClick={() => void load()}>
              <RefreshCw size={18} />
            </button>
            <Bell size={18} />
            <span className="avatar small">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="portal-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {isBank
                  ? 'BANKING, WITH COMPLETE CONTROL'
                  : isAdmin
                    ? 'EVERY OPERATION. ACCOUNTED FOR.'
                    : 'A LITTLE NOW. A LITTLE LATER.'}
              </span>
              <h1>
                {page
                  ? title
                  : isBank
                    ? 'Your bank, at a glance.'
                    : isAdmin
                      ? 'Operations overview.'
                      : `Good to see you, ${user.name.split(' ')[0]}.`}
              </h1>
              <p>
                {isBank
                  ? 'Manage fictional balances and explore what happens when banking gets complicated.'
                  : isAdmin
                    ? 'Review requests, follow the money, and keep every transaction in balance.'
                    : 'A clear view of your purchases, payments, and possibilities.'}
              </p>
            </div>
            <span className="date-tag">{date(new Date().toISOString())}</span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => void load()}>Retry</button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading">Connecting to your workspace…</div>
          ) : (
            <>
              <div className="toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your workspace"
                    aria-label="Search your workspace"
                  />
                </div>
                <span className="muted">AMD currency · Server-persisted records</span>
              </div>
              {isBank ? (
                <BankContent data={data} page={page} act={act} busy={busy} search={search} />
              ) : isAdmin ? (
                <AdminContent data={data} page={page} act={act} busy={busy} search={search} />
              ) : (
                <CustomerContent
                  data={data}
                  page={page}
                  productId={section[1]}
                  act={act}
                  busy={busy}
                  search={search}
                />
              )}
            </>
          )}
          <footer className="portal-footer">
            <span>
              <Layers3 size={14} />
              CrediFlow · Built for understanding.
            </span>
            <span>Simulation only. Zero real financial activity.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function CustomerContent({
  data,
  page,
  productId,
  act,
  busy,
  search,
}: {
  data: PortalData;
  page: string;
  productId?: string;
  act: Action;
  busy: boolean;
  search: string;
}) {
  const [count, setCount] = useState<4 | 6>(4),
    [category, setCategory] = useState('All products');
  const cart: Record<string, number> = Object.fromEntries(
    (data.cart ?? []).map((i) => [i.productId, i.quantity]),
  );
  const setCart = (next: Record<string, number>) => {
    for (const productId of Object.keys({ ...cart, ...next }))
      if ((cart[productId] ?? 0) !== (next[productId] ?? 0))
        void act({ action: 'SET_CART_ITEM', productId, quantity: next[productId] ?? 0 });
  };
  const checkoutKey = useRef<string | null>(null);
  const products = data.products ?? [],
    purchases = data.purchases ?? [],
    payments = data.payments ?? [];
  const total = products.reduce((n, p) => n + BigInt(p.price) * BigInt(cart[p.id] ?? 0), 0n);
  const installments = purchases.flatMap((p) => p.installments.map((i) => ({ ...i, purchase: p })));
  const outstanding = installments
    .filter((i) => i.status !== 'PAID' && i.purchase.status === 'ACTIVE')
    .reduce((n, i) => n + BigInt(i.amount), 0n);
  const catalog = products.filter(
    (p) =>
      (category === 'All products' || p.category === category) &&
      `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = products.find((p) => p.id === productId);
  const pay = (i: Installment) =>
    void act({ action: 'PAY', installmentId: i.id, key: crypto.randomUUID() });
  const cartPanel = (
    <section className="panel cart-panel">
      <div className="panel-title">
        <h2>Your bag</h2>
        <ShoppingCart size={20} />
      </div>
      {total > 0n ? (
        <>
          <div className="cart-lines">
            {products
              .filter((p) => cart[p.id])
              .map((p) => (
                <div className="cart-line" key={p.id}>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{money(p.price)} each</small>
                  </span>
                  <input
                    aria-label={`${p.name} quantity`}
                    type="number"
                    min="0"
                    max="10"
                    value={cart[p.id]}
                    onChange={(e) => {
                      setCart({
                        ...cart,
                        [p.id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                      });
                      checkoutKey.current = null;
                    }}
                  />
                </div>
              ))}
          </div>
          <div className="cart-total">
            <span>Total purchase</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="plan-toggle">
            {([4, 6] as const).map((n) => (
              <button
                className={count === n ? 'selected' : ''}
                key={n}
                onClick={() => {
                  setCount(n);
                  checkoutKey.current = null;
                }}
              >
                {n} installments
              </button>
            ))}
          </div>
          <p className="muted">0% interest. No fees. First payment after approval.</p>
          <div className="schedule-preview">
            {total >= BigInt(count) &&
              schedule(total, count, new Date()).map((s) => (
                <div key={s.number}>
                  <span>{s.number === 1 ? 'At confirmation' : date(s.dueAt.toISOString())}</span>
                  <strong>{money(s.amount)}</strong>
                </div>
              ))}
          </div>
          <Button
            disabled={busy || !data.link}
            onClick={async () => {
              checkoutKey.current ??= crypto.randomUUID();
              if (
                await act({
                  action: 'CHECKOUT',
                  key: checkoutKey.current,
                  count,
                  items: Object.entries(cart)
                    .filter(([, q]) => q > 0)
                    .map(([productId, quantity]) => ({ productId, quantity })),
                })
              ) {
                checkoutKey.current = null;
              }
            }}
          >
            Submit purchase request
          </Button>
          <span className="fine-print">An administrator reviews every request.</span>
        </>
      ) : (
        <Empty>Your bag is ready for something good.</Empty>
      )}
    </section>
  );
  return (
    <>
      {data.bankError && <div className="alert error">{data.bankError}</div>}
      {!data.link && (
        <div className="alert">
          <span>
            Create your own fictional bank account before submitting a purchase. New accounts start
            at zero; a bank administrator can grant demo funds and credit.
          </span>
          <Button disabled={busy} onClick={() => void act({ action: 'LINK_BANK' })}>
            Create demo bank account
          </Button>
        </div>
      )}
      {!page && (
        <>
          <div className="customer-overview">
            <section className="balance-card">
              <div className="balance-top">
                <span>YOUR FICTIONAL BANK ACCOUNT</span>
                <Landmark size={24} />
              </div>
              <span className="balance-label">Available cash balance</span>
              <strong>{data.account ? money(data.account.cash) : 'Unavailable'}</strong>
              <div className="balance-bottom">
                <span>{data.account?.number ?? 'Connect a fictional account'}</span>
                <span>AMD</span>
              </div>
            </section>
            <Metric
              label="Available credit"
              value={
                data.account
                  ? money(
                      BigInt(data.account.creditLimit) -
                        BigInt(data.account.used) -
                        BigInt(data.account.reserved),
                    )
                  : 'Unavailable'
              }
              detail="Granted by the fictional bank"
              icon={CreditCard}
            />
            <Metric
              label="Outstanding installments"
              value={money(outstanding)}
              detail={`${purchases.filter((p) => p.status === 'ACTIVE').length} active purchase plans`}
              icon={Layers3}
            />
          </div>
          <div className="section-heading">
            <div>
              <h2>Make room for something good.</h2>
              <p>Thoughtful finds. Flexible payments. Zero interest.</p>
            </div>
            <Link href="/app/catalog" className="subtle-link">
              Explore the catalog
            </Link>
          </div>
          <div className="product-grid featured">
            {products.slice(0, 4).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                add={() => {
                  setCart({ ...cart, [p.id]: Math.min(10, (cart[p.id] ?? 0) + 1) });
                  checkoutKey.current = null;
                }}
              />
            ))}
          </div>
        </>
      )}
      {(page === 'catalog' || page === 'products') && (
        <>
          <div className="category-tabs">
            {['All products', ...new Set(products.map((p) => p.category))].map((c) => (
              <button
                className={category === c ? 'selected' : ''}
                onClick={() => setCategory(c)}
                key={c}
              >
                {c}
              </button>
            ))}
          </div>
          {selected ? (
            <section className="panel product-detail">
              <ProductArt product={selected} />
              <div>
                <span className="eyebrow">{selected.category}</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
                <h3>{money(selected.price)}</h3>
                <p>{selected.stock} units available · Fictional product</p>
                <Button
                  disabled={selected.stock === 0}
                  onClick={() =>
                    setCart({ ...cart, [selected.id]: Math.min(10, (cart[selected.id] ?? 0) + 1) })
                  }
                >
                  Add to bag
                </Button>
              </div>
            </section>
          ) : (
            <div className="product-grid">
              {catalog.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  add={() => {
                    setCart({ ...cart, [p.id]: Math.min(10, (cart[p.id] ?? 0) + 1) });
                    checkoutKey.current = null;
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
      {(!page || page === 'catalog' || page === 'products') && total > 0n && cartPanel}
      {(!page || page === 'requests') && (
        <PurchaseList
          purchases={purchases.filter((p) =>
            `${p.id} ${p.status}`.toLowerCase().includes(search.toLowerCase()),
          )}
          title="Your purchase requests"
          act={act}
          busy={busy}
          admin={false}
        />
      )}{' '}
      {(page === 'installments' || !page) && (
        <section className="panel">
          <div className="panel-title">
            <h2>Your installment plans</h2>
            <span className="muted">Monthly · 0% interest</span>
          </div>
          {installments.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Purchase</th>
                    <th>Installment</th>
                    <th>Due date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((i) => (
                    <tr key={i.id}>
                      <td>{i.purchase.items[0]?.name}</td>
                      <td>
                        {i.number} of {i.purchase.count}
                      </td>
                      <td>{date(i.dueAt)}</td>
                      <td>{money(i.amount)}</td>
                      <td>
                        <Status value={i.status} />
                      </td>
                      <td>
                        {['SCHEDULED', 'DUE', 'OVERDUE'].includes(i.status) &&
                          ['ACTIVE', 'APPROVED_AWAITING_PAYMENT'].includes(i.purchase.status) && (
                            <Button variant="secondary" disabled={busy} onClick={() => pay(i)}>
                              Pay {money(i.amount)}
                            </Button>
                          )}
                        {i.status === 'PAID' && (
                          <span className="paid-label">
                            <Check size={15} /> Paid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Your installment schedule appears after purchase approval.</Empty>
          )}
        </section>
      )}
      {page === 'payments' && <Records title="Payment history" rows={payments} />}
    </>
  );
}
function ProductArt({ product }: { product: Product }) {
  const Icon =
    product.icon === 'headphones' || product.icon === 'earbuds'
      ? Headphones
      : product.icon === 'laptop' || product.icon === 'keyboard'
        ? Laptop
        : product.icon === 'smartphone' || product.icon === 'tablet'
          ? Smartphone
          : product.icon === 'watch'
            ? Watch
            : product.icon === 'camera'
              ? Camera
              : product.icon === 'monitor'
                ? Monitor
                : product.icon === 'armchair'
                  ? Armchair
                  : Package;
  return (
    <div className={`product-art art-${Number(product.id.slice(-2)) % 5}`}>
      <div className="art-orbit" />
      <Icon strokeWidth={1.15} />
      <span>CF / {product.category.toUpperCase()}</span>
    </div>
  );
}
function ProductCard({ product: p, add }: { product: Product; add: () => void }) {
  return (
    <article className="product-card">
      <Link href={`/app/products/${p.id}`} aria-label={`View ${p.name}`}>
        <ProductArt product={p} />
      </Link>
      <div className="product-info">
        <span>{p.category}</span>
        <Link href={`/app/products/${p.id}`}>
          <h3>{p.name}</h3>
        </Link>
        <strong>{money(p.price)}</strong>
        <div className="product-card-bottom">
          <small>4 payments from {money(BigInt(p.price) / 4n)}</small>
          <button aria-label={`Add ${p.name} to bag`} disabled={p.stock === 0} onClick={add}>
            <ShoppingBag size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
function PurchaseList({
  purchases,
  title,
  act,
  busy,
  admin,
}: {
  purchases: Purchase[];
  title: string;
  act: Action;
  busy: boolean;
  admin: boolean;
}) {
  const [reason, setReason] = useState<Record<string, string>>({});
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span className="muted">{purchases.length} requests</span>
      </div>
      {purchases.length ? (
        <div className="purchase-list">
          {purchases.map((p) => (
            <details className="purchase-row" key={p.id}>
              <summary>
                <span className="purchase-symbol">
                  <ShoppingBag size={20} />
                </span>
                <span className="purchase-name">
                  <strong>{p.items.map((i) => i.name).join(', ')}</strong>
                  <small>
                    {admin ? `${p.customer.name} · ` : ''}
                    {date(p.createdAt)} · {p.count} installments
                  </small>
                </span>
                <strong>{money(p.total)}</strong>
                <Status value={p.status} />
                <ChevronRight size={16} />
              </summary>
              <div className="purchase-expanded">
                <code>{p.id}</code>
                {p.reason && <p>Decision note: {p.reason}</p>}
                {p.bankCheck && (
                  <div className="bank-snapshot">
                    <h3>Bank-provided snapshot</h3>
                    <span>Cash: {money(String(p.bankCheck.cash))}</span>
                    <span>Credit limit: {money(String(p.bankCheck.creditLimit))}</span>
                    <span>Available credit: {money(String(p.bankCheck.availableCredit))}</span>
                    <small>Observed {String(p.bankCheck.observedAt)}</small>
                  </div>
                )}
                {admin && p.status === 'PENDING_REVIEW' && (
                  <div className="decision-form">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void act({ action: 'CHECK_CREDIT', id: p.id })}
                    >
                      <Landmark size={16} />
                      Check bank credit
                    </Button>
                    <label>
                      Decision reason
                      <input
                        placeholder="Explain the decision"
                        value={reason[p.id] ?? ''}
                        onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })}
                      />
                    </label>
                    <Button
                      disabled={busy || !p.bankCheck || (reason[p.id] ?? '').length < 4}
                      onClick={() =>
                        void act({
                          action: 'DECIDE',
                          id: p.id,
                          approve: true,
                          reason: reason[p.id],
                        })
                      }
                    >
                      Approve request
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || (reason[p.id] ?? '').length < 4}
                      onClick={() =>
                        void act({
                          action: 'DECIDE',
                          id: p.id,
                          approve: false,
                          reason: reason[p.id],
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {!admin && p.status === 'APPROVED_AWAITING_PAYMENT' && p.installments[0] && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: 'PAY',
                        installmentId: p.installments[0].id,
                        key: crypto.randomUUID(),
                      })
                    }
                  >
                    Confirm first payment · {money(p.installments[0].amount)}
                  </Button>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty>No purchase requests to display.</Empty>
      )}
    </section>
  );
}

function AdminContent({
  data,
  page,
  act,
  busy,
  search,
}: {
  data: PortalData;
  page: string;
  act: Action;
  busy: boolean;
  search: string;
}) {
  const purchases = (data.purchases ?? []).filter((p) =>
      `${p.id} ${p.customer.name} ${p.customer.email} ${p.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    payments = data.payments ?? [];
  const outstanding = purchases
    .filter((p) => p.status === 'ACTIVE')
    .flatMap((p) => p.installments)
    .filter((i) => i.status !== 'PAID')
    .reduce((n, i) => n + BigInt(i.amount), 0n);
  if (page === 'customers')
    return <Records rows={data.customers ?? []} title="Customer directory" />;
  if (page === 'installments')
    return (
      <Records
        rows={purchases.flatMap((p) =>
          p.installments.map((i) => ({ ...i, purchaseId: p.id, customer: p.customer.name })),
        )}
        title="Installment schedules"
      />
    );
  if (page === 'payments') return <Records rows={payments} title="Payment intents & attempts" />;
  if (page === 'webhooks') return <Records rows={data.inbox ?? []} title="Durable webhook inbox" />;
  if (page === 'audit-logs')
    return <Records rows={data.audit ?? []} title="Immutable audit trail" />;
  if (page === 'transactions')
    return (
      <>
        <Records rows={payments} title="Payment inspector" />
        <Records rows={data.journals ?? []} title="Double-entry journals" />
        <Records rows={data.audit ?? []} title="Transaction timeline" />
      </>
    );
  if (page === 'bank-checks')
    return (
      <Records
        rows={purchases
          .filter((p) => p.bankCheck)
          .map((p) => ({ id: p.id, customer: p.customer.name, ...p.bankCheck }))}
        title="Persisted bank credit checks"
      />
    );
  if (page === 'workers')
    return (
      <section className="panel">
        <div className="panel-title">
          <h2>Durable background jobs</h2>
          <span className="muted">Database leases · At-least-once execution</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Job</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Recovery</th>
              </tr>
            </thead>
            <tbody>
              {(data.jobs ?? []).map((j) => (
                <tr key={j.id}>
                  <td>
                    <code>{j.id}</code>
                  </td>
                  <td>{j.kind}</td>
                  <td>
                    <Status value={j.status} />
                  </td>
                  <td>{j.attempts}</td>
                  <td>{j.error ?? '—'}</td>
                  <td>
                    {['RETRY', 'DEAD'].includes(j.status) && (
                      <Button
                        disabled={busy}
                        variant="secondary"
                        onClick={() => void act({ action: 'RETRY_JOB', id: j.id })}
                      >
                        Retry safely
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  if (page === 'reconciliation')
    return (
      <>
        <section className="panel feature-panel">
          <RefreshCw />
          <div>
            <h2>Keep every dram accounted for.</h2>
            <p>
              Compare bank operation outcomes, reservations, balances, and ledger records.
              Corrections preserve the original operation IDs.
            </p>
          </div>
          <Button disabled={busy} onClick={() => void act({ action: 'RECONCILE' })}>
            Run reconciliation
          </Button>
        </section>
        <Records rows={data.reconciliations ?? []} title="Reconciliation history" />
      </>
    );
  if (page === 'settings')
    return (
      <section className="panel feature-panel">
        <ShieldCheck />
        <div>
          <h2>Fictional finance, explicit boundaries.</h2>
          <p>
            Currency: whole AMD. Plans: 4 or 6 monthly installments. Interest: 0%. Late fees: none.
            Each request requires manual review. Sessions expire after 24 hours.
          </p>
        </div>
      </section>
    );
  return (
    <>
      {!page && (
        <>
          <div className="metrics-grid">
            <Metric
              label="Purchase requests"
              value={String(purchases.length)}
              detail={`${purchases.filter((p) => p.status === 'PENDING_REVIEW').length} awaiting manual review`}
              icon={ShoppingBag}
            />
            <Metric
              label="Outstanding principal"
              value={money(outstanding)}
              detail={`${purchases.filter((p) => p.status === 'ACTIVE').length} active agreements`}
              icon={CreditCard}
            />
            <Metric
              label="Successful payments"
              value={String(payments.filter((p) => p.status === 'SUCCEEDED').length)}
              detail="Confirmed by authoritative bank inquiry"
              icon={ArrowDownLeft}
            />
            <Metric
              label="Needs attention"
              value={String(
                payments.filter((p) => p.status === 'PENDING_RECONCILIATION').length +
                  (data.jobs ?? []).filter((j) => j.status === 'DEAD').length,
              )}
              detail="Unknown payments & failed jobs"
              icon={Activity}
            />
          </div>
          <div className="overview-banner">
            <div>
              <span className="eyebrow">TRANSPARENCY IS THE DEFAULT</span>
              <h2>Every payment has a story.</h2>
              <p>Follow the request, bank operation, webhook, and journal behind it.</p>
            </div>
            <Link className="button secondary" href="/admin/transactions">
              Inspect transactions
            </Link>
          </div>
          <PaymentActivity payments={payments} />
        </>
      )}
      <PurchaseList
        purchases={page === 'orders' ? purchases.filter((p) => p.status === 'ACTIVE') : purchases}
        title={page === 'orders' ? 'Active orders' : 'Purchase requests'}
        act={act}
        busy={busy}
        admin
      />
    </>
  );
}

function PaymentActivity({ payments }: { payments: Payment[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - (6 - i));
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      label: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      count: payments.filter((p) => p.status === 'SUCCEEDED' && p.createdAt.startsWith(key)).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <figure className="panel payment-chart">
      <figcaption className="panel-title">
        <h2>Payment activity</h2>
        <span className="muted">Successful payments · Last 7 UTC days</span>
      </figcaption>
      <div
        className="chart-bars"
        role="img"
        aria-label={days.map((d) => `${d.label}: ${d.count} successful payments`).join('; ')}
      >
        {days.map((d) => (
          <div className="chart-column" key={d.key}>
            <span>{d.count}</span>
            <div className="chart-track">
              <div style={{ height: `${(d.count / max) * 100}%` }} />
            </div>
            <small>{d.label}</small>
          </div>
        ))}
      </div>
    </figure>
  );
}

function BankContent({
  data,
  page,
  act,
  busy,
  search,
}: {
  data: PortalData;
  page: string;
  act: Action;
  busy: boolean;
  search: string;
}) {
  const accounts = (data.accounts ?? []).filter((a) =>
    `${a.name} ${a.number}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (page === 'simulator')
    return (
      <Simulator
        key={data.settings?.version ?? 0}
        settings={data.settings ?? { config: defaults, nextScenario: null }}
        accounts={accounts}
        act={act}
        busy={busy}
      />
    );
  if (page === 'transactions')
    return (
      <>
        <Records rows={data.operations ?? []} title="Bank operations" />
        <Records rows={data.journals ?? []} title="Bank double-entry journals" />
      </>
    );
  if (page === 'credit')
    return <Records rows={data.reservations ?? []} title="Credit reservations & financing" />;
  if (page === 'logs') return <Records rows={data.logs ?? []} title="Bank simulation logs" />;
  if (page === 'webhooks')
    return (
      <>
        <section className="panel">
          <div className="panel-title">
            <h2>Transactional outbox</h2>
            <span className="muted">Signed · Retryable · Replay-safe</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Replay</th>
                </tr>
              </thead>
              <tbody>
                {(data.events ?? []).map((e) => (
                  <tr key={e.id}>
                    <td>
                      <code>{e.id}</code>
                    </td>
                    <td>{e.type}</td>
                    <td>
                      <Status value={e.status} />
                    </td>
                    <td>{e.attempts}</td>
                    <td>
                      <Button
                        disabled={busy}
                        variant="secondary"
                        onClick={() => void act({ action: 'REPLAY_WEBHOOK', id: e.id })}
                      >
                        Replay event
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <Records rows={data.deliveries ?? []} title="Delivery attempt history" />
      </>
    );
  if (page === 'settings')
    return (
      <section className="panel feature-panel">
        <Landmark />
        <div>
          <h2>A fictional bank with real transaction boundaries.</h2>
          <p>
            Bank accounts and ledger records live in an isolated PostgreSQL schema. Only
            authenticated bank operations can change balances. Available credit = granted credit −
            used credit − reservations.
          </p>
        </div>
      </section>
    );
  return (
    <>
      {!page && (
        <>
          <div className="metrics-grid">
            <Metric
              label="Total fictional cash"
              value={money(accounts.reduce((n, a) => n + BigInt(a.cash), 0n))}
              detail={`${accounts.length} fictional bank accounts`}
              icon={Landmark}
            />
            <Metric
              label="Credit granted"
              value={money(accounts.reduce((n, a) => n + BigInt(a.creditLimit), 0n))}
              detail="Bank-admin controlled limits"
              icon={CreditCard}
            />
            <Metric
              label="Credit in use"
              value={money(accounts.reduce((n, a) => n + BigInt(a.used), 0n))}
              detail="Outstanding financed principal"
              icon={Layers3}
            />
            <Metric
              label="Reserved credit"
              value={money(accounts.reduce((n, a) => n + BigInt(a.reserved), 0n))}
              detail="Pending purchase commitments"
              icon={WalletCards}
            />
          </div>
          <div className="overview-banner bank-banner">
            <div>
              <span className="eyebrow">EXPLORE THE UNEXPECTED</span>
              <h2>Healthy bank. Lost response. Everything between.</h2>
              <p>Configure failures and watch durable recovery in action.</p>
            </div>
            <Link className="button secondary" href="/bank/simulator">
              Open bank simulator
            </Link>
          </div>
        </>
      )}
      <section className="panel">
        <div className="panel-title">
          <h2>Fictional bank accounts</h2>
          <span className="muted">Audited balance adjustments</span>
        </div>
        {accounts.map((a) => (
          <AccountEditor key={a.id} account={a} act={act} busy={busy} />
        ))}
      </section>
    </>
  );
}
function AccountEditor({
  account: a,
  act,
  busy,
}: {
  account: Account;
  act: Action;
  busy: boolean;
}) {
  return (
    <details className="account-row">
      <summary>
        <span className="avatar">{a.name.slice(0, 1)}</span>
        <span className="purchase-name">
          <strong>{a.name}</strong>
          <small>{a.number}</small>
        </span>
        <span>
          <small>Cash balance</small>
          <strong>{money(a.cash)}</strong>
        </span>
        <span>
          <small>Available credit</small>
          <strong>{money(BigInt(a.creditLimit) - BigInt(a.used) - BigInt(a.reserved))}</strong>
        </span>
        <Status value={a.status} />
        <ChevronRight size={16} />
      </summary>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await act({
            action: 'ADJUST_ACCOUNT',
            id: crypto.randomUUID(),
            accountId: a.id,
            cash: form.get('cash'),
            creditLimit: form.get('creditLimit'),
            status: form.get('status'),
            reason: form.get('reason'),
          });
        }}
      >
        <label>
          Fictional cash balance (AMD)
          <input
            name="cash"
            inputMode="numeric"
            pattern="[0-9]{1,13}"
            required
            defaultValue={a.cash}
          />
        </label>
        <label>
          Credit limit (AMD)
          <input
            name="creditLimit"
            inputMode="numeric"
            pattern="[0-9]{1,13}"
            required
            defaultValue={a.creditLimit}
          />
        </label>
        <label>
          Account status
          <select name="status" defaultValue={a.status}>
            <option value="ACTIVE">Active</option>
            <option value="FROZEN">Frozen</option>
          </select>
        </label>
        <label>
          Adjustment reason
          <input
            name="reason"
            required
            minLength={4}
            maxLength={300}
            placeholder="Fictional balance top-up"
          />
        </label>
        <Button disabled={busy}>Save audited adjustment</Button>
        <span className="muted">
          Used: {money(a.used)} · Reserved: {money(a.reserved)}
        </span>
      </form>
    </details>
  );
}
function Simulator({
  settings,
  accounts,
  act,
  busy,
}: {
  settings: { config: z.infer<typeof simulatorSchema>; nextScenario: string | null };
  accounts: Account[];
  act: Action;
  busy: boolean;
}) {
  const [config, setConfig] = useState(settings.config),
    [nextScenario, setScenario] = useState(settings.nextScenario ?? ''),
    [testAccount, setTestAccount] = useState(accounts[0]?.id ?? '');
  const fields: [keyof typeof config, string, string, number][] = [
    ['httpErrorRate', 'HTTP error probability', 'Pre-commit server errors', 100],
    ['timeoutRate', 'Timeout probability', 'No confirmed response; inquiry required', 100],
    [
      'timeoutAfterCommitRate',
      'Lost response after commit',
      'Financial operation succeeds; HTTP response is lost',
      100,
    ],
    ['retryableErrorRate', 'Retryable error probability', 'Simulated bank unavailability', 100],
    ['baseLatencyMs', 'Base latency', 'Milliseconds added to bank HTTP calls', 5000],
    ['randomLatencyMs', 'Random latency', 'Additional random milliseconds', 5000],
    ['webhookDelayMs', 'Webhook delay', 'Milliseconds before first delivery', 86400000],
    [
      'webhookDuplicateRate',
      'Duplicate webhook probability',
      'At-least-once delivery testing',
      100,
    ],
    [
      'webhookFailureRate',
      'Webhook failure probability',
      'Durable retries retain every attempt',
      100,
    ],
  ];
  const preset = (name: string) => {
    setScenario('');
    if (name === 'HEALTHY') setConfig({ ...defaults, simulationEnabled: false });
    else if (name === 'SLOW')
      setConfig({
        ...defaults,
        httpErrorRate: 0,
        timeoutRate: 0,
        baseLatencyMs: 4000,
        randomLatencyMs: 1000,
      });
    else if (name === 'OFFLINE') setConfig({ ...defaults, httpErrorRate: 100, timeoutRate: 0 });
    else setScenario(name);
  };
  return (
    <>
      <Link className="button secondary" href="/bank/logs">
        View Execution Details
      </Link>
      <div className="simulator-intro">
        <span className="simulator-symbol">
          <Settings2 size={26} />
        </span>
        <div>
          <h2>Make the unpredictable, predictable.</h2>
          <p>
            Settings persist in PostgreSQL and apply to subsequent HTTP requests. Targeted scenarios
            apply to the next financial operation.
          </p>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={config.simulationEnabled}
            onChange={(e) => setConfig({ ...config, simulationEnabled: e.target.checked })}
          />
          Failure injection enabled
        </label>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Scenario presets</h2>
          <span className="muted">Select, then save</span>
        </div>
        <div className="preset-grid">
          {scenarios.map((s) => (
            <button
              className={nextScenario === s ? 'preset selected' : 'preset'}
              key={s}
              onClick={() => preset(s)}
            >
              {readable(s)}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Failure & latency controls</h2>
          <span className="muted">Transport probabilities must total ≤ 100%</span>
        </div>
        <div className="simulator-grid">
          {fields.map(([key, label, description, max]) => (
            <label className="simulator-control" key={key}>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <div>
                <input
                  aria-label={`${label} slider`}
                  type="range"
                  min="0"
                  max={max}
                  value={Number(config[key])}
                  onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
                />
                <input
                  aria-label={label}
                  type="number"
                  min="0"
                  max={max}
                  value={Number(config[key])}
                  onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
                />
                <span>{max === 100 ? '%' : 'ms'}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="simulator-bottom">
          <label>
            Random seed
            <input
              value={config.randomSeed}
              onChange={(e) => setConfig({ ...config, randomSeed: e.target.value })}
            />
          </label>
          <label>
            Next financial operation
            <select value={nextScenario} onChange={(e) => setScenario(e.target.value)}>
              <option value="">Use probability settings</option>
              {scenarios.map((s) => (
                <option key={s} value={s}>
                  {readable(s)}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              void act({ action: 'SAVE_SIMULATOR', config, nextScenario: nextScenario || null })
            }
          >
            Save configuration
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void act({ action: 'RESET_SIMULATOR' })}
          >
            Reset defaults
          </Button>
        </div>
      </section>
      <section className="panel feature-panel">
        <Activity />
        <div>
          <h2>Test the bank HTTP boundary</h2>
          <p>Calls the authenticated bank API and records the applied latency and HTTP outcome.</p>
          <select
            aria-label="Test bank account"
            value={testAccount}
            onChange={(e) => setTestAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={busy || !testAccount}
          onClick={() => void act({ action: 'TEST_BANK', id: testAccount })}
        >
          Run test request
        </Button>
      </section>
    </>
  );
}
