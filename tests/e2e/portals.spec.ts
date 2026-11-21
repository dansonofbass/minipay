import { test, expect } from '@playwright/test';
import 'dotenv/config';
test('customer signs in, browses catalog, and sees persisted requests', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('alice@crediflow.demo');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole('heading', { name: 'Good to see you, Alice.' })).toBeVisible();
  await expect(page.getByText('Available cash balance')).toBeVisible();
  await expect(page.getByText('Connecting to your workspace…')).not.toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/customer.png', fullPage: true });
  await page.getByRole('link', { name: 'Explore products', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio Wireless Headphones' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Studio Wireless Headphones to bag' }).click();
  await expect(page.getByRole('heading', { name: 'Your bag' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your bag' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit purchase request' })).toBeEnabled();
  expect(errors).toEqual([]);
});
test('administrator portal and simulator controls render with role isolation', async ({
  browser,
}) => {
  for (const [email, path, title, screenshot] of [
    ['admin@crediflow.demo', '/admin', 'Operations overview.', 'admin'],
    ['bank@crediflow.demo', '/bank', 'Your bank, at a glance.', 'bank'],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await expect(page).toHaveURL(new RegExp(`${path}/?$`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Connecting to your workspace…')).not.toBeVisible();
    await page.screenshot({ path: `docs/screenshots/${screenshot}.png`, fullPage: true });
    if (path === '/bank') {
      await page.getByRole('link', { name: 'Bank simulator', exact: true }).click();
      await expect(page.getByLabel('HTTP error probability', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Healthy', exact: true }).click();
      await page.getByRole('button', { name: 'Save configuration' }).click();
      await expect(page.getByRole('status')).toContainText('Saved');
      await page.screenshot({ path: 'docs/screenshots/simulator.png', fullPage: true });
    }
    await context.close();
  }
});
test('mobile layout keeps catalog and navigation usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good things. At your own pace.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await context.close();
});
