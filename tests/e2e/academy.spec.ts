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
  await page.getByRole('button', { name: 'BEGIN LEARN DRILL' }).click();

  // Reproduce a real browser focus change. Hardware keys must still reach the
  // lesson instead of making Academy appear unresponsive.
  await page.getByRole('button', { name: 'RETURN FOCUS TO DRILL' }).focus();
  await page.keyboard.type(HOME_ROW_DRILL);

  await expect(page.getByRole('heading', { name: 'Stage cleared.' })).toBeVisible();
  await expect(page.getByText('100.0%', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.localStorage.getItem('typerival:academy:v1'));
  expect(saved).toContain('"home-row"');
  expect(saved).toContain('"completed":false');
  expect(saved).toContain('"completedStages":["learn"]');

  await page.getByRole('button', { name: 'NEXT STAGE' }).click();
  await expect(page.getByText('LESSON 01 · STAGE 2 OF 3 · BUILD')).toBeVisible();
});

test('holds a missed key without changing the authored drill on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Start Find your home row lesson' }).click();
  const setupChecks = page.getByRole('checkbox');
  for (let index = 0; index < 3; index += 1) await setupChecks.nth(index).check();
  await page.getByRole('button', { name: 'BEGIN LEARN DRILL' }).click();

  await page.keyboard.press('x');

  await expect(page.getByText('Left pinky for A. Stay relaxed and try that key again.')).toBeVisible();
  await expect(page.getByText('0/31', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Touch typing keyboard guide')).toBeVisible();
});

test('a Speed Ladder miss cannot splice characters into rhythm', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Unlock the next speed lesson' }).click();
  const setupChecks = page.getByRole('checkbox');
  for (let index = 0; index < 3; index += 1) await setupChecks.nth(index).check();
  await page.getByRole('button', { name: 'BEGIN BASELINE DRILL' }).click();

  const drill = 'the quick rival builds speed with calm hands and clean rhythm';
  const prefix = 'the quick rival builds speed with calm hands and clean rh';
  await page.keyboard.type(prefix);
  await page.keyboard.press('.');

  await expect(page.getByLabel('Current drill sequence')).not.toContainText('.');
  await expect(page.getByText(`${prefix.length}/${drill.length}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Type Y')).toBeVisible();
  await page.keyboard.type('ythm');
  await expect(page.getByRole('heading', { name: 'Stage cleared.' })).toBeVisible();
});
