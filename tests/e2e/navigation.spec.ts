import { expect, test } from '@playwright/test';

const appUrl = 'http://127.0.0.1:3000';

test('desktop navigation has an explicit Home button without an Install button', async ({ page }) => {
  await page.goto('/?age=adult');
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'ENTER THE ACADEMY' }).click();
  await expect(page).toHaveURL(/academy=1/);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
  await expect(page.getByRole('heading', { name: /Type fast/ })).toBeVisible();
});

test('light and dark mode can be switched and persist on the device', async ({ page }) => {
  await page.goto('/?age=adult');
  await page.evaluate(() => window.localStorage.removeItem('typerival:theme:v1'));
  await page.reload();

  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('phone and tablet navigation exposes Add to Home Screen installation', async ({ browser }) => {
  for (const device of [
    { name: 'phone', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' },
    { name: 'tablet', width: 820, height: 1180, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' },
  ]) {
    const context = await browser.newContext({
      baseURL: appUrl,
      hasTouch: true,
      userAgent: device.userAgent,
      viewport: { width: device.width, height: device.height },
    });
    const mobilePage = await context.newPage();
    await mobilePage.goto('/?age=adult');

    await expect(mobilePage.getByRole('button', { name: 'Home', exact: true }), device.name).toBeVisible();
    await expect(mobilePage.getByRole('button', { name: 'Install', exact: true }), device.name).toBeVisible();

    await context.close();
  }
});
