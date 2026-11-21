const base = process.env.APP_URL ?? 'http://localhost:3000';
for (const [path, status] of [
  ['/', 200],
  ['/login', 200],
  ['/api/health', 200],
  ['/api/portal', 401],
  ['/app', 307],
  ['/admin', 307],
  ['/bank', 307],
]) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  if (response.status !== status)
    throw new Error(`${path}: expected ${status}; got ${response.status}`);
  console.log(`${path}: ${response.status}`);
}
