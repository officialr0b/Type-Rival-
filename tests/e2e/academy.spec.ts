import { expect, test } from '@playwright/test';

const HOME_ROW_DRILL = 'asdf jkl; fj dk sl a; asdf jkl;';

test.beforeEach(async ({ page }) => {
  await page.goto('/?age=adult&academy=1');
  await expect(page.getByRole('heading', { name: /Learn the motion/ })).toBeVisible();
  await page.evaluate(() => window.localStorage.removeItem('typerival:academy:v1'));
  await page.reload();
});

test('completes a lesson and saves local Academy progress', async ({ page }) => {
  await expect(page.getByRole('button', { name: /lesson$/ })).toHaveCount(6);
  await page.getByRole('button', { name: 'Start Find your home row lesson' }).click();

  const setupChecks = page.getByRole('checkbox');
  await expect(setupChecks).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await setupChecks.nth(index).check();
  await page.getByRole('button', { name: 'BEGIN GUIDED DRILL' }).click();

  // Reproduce a real browser focus change. Hardware keys must still reach the
  // lesson instead of making Academy appear unresponsive.
  await page.getByRole('button', { name: 'RETURN FOCUS TO DRILL' }).focus();
  await page.keyboard.type(HOME_ROW_DRILL);

  await expect(page.getByRole('heading', { name: 'Movement unlocked.' })).toBeVisible();
  await expect(page.getByText('100.0%', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.localStorage.getItem('typerival:academy:v1'));
  expect(saved).toContain('"home-row"');
  expect(saved).toContain('"completed":true');
});

test('adapts a drill after a missed key on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Start Find your home row lesson' }).click();
  const setupChecks = page.getByRole('checkbox');
  for (let index = 0; index < 3; index += 1) await setupChecks.nth(index).check();
  await page.getByRole('button', { name: 'BEGIN GUIDED DRILL' }).click();

  await page.keyboard.press('x');

  await expect(page.getByText('Left pinky for A. Stay relaxed and try that key again.')).toBeVisible();
  await expect(page.getByText('0/32', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Touch typing keyboard guide')).toBeVisible();
});
