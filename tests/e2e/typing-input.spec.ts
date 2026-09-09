import { expect, test } from '@playwright/test';

test('hardware typing survives browser focus changes during an active race', async ({ page }) => {
  await page.goto('/?age=adult');
  // WebKit can paint the server response before the client initialization
  // timer has attached the mode-selection handlers.
  await expect(page.getByText('LOCAL PLAYER', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PRACTICE NOW' }).click();
  await page.getByRole('button', { name: 'START 45-SECOND RUN' }).click();
  await page.getByRole('button', { name: 'TAP TO START' }).click();

  const passage = page.locator('[aria-label^="Typing passage:"]');
  await expect(passage).toBeVisible({ timeout: 7_000 });
  const accessiblePassage = await passage.getAttribute('aria-label');
  const passageText = accessiblePassage?.replace(/^Typing passage:\s*/, '') ?? '';
  const sample = Array.from(passageText).slice(0, 18).join('');
  expect(sample.length).toBe(18);

  // Reproduce the reported failure mode: the browser moves focus away from the
  // one-pixel typing field after the countdown, then hardware keys arrive.
  const exitButton = page.getByRole('button', { name: /EXIT/ });
  await exitButton.focus();
  await expect(exitButton).toBeFocused();
  await page.keyboard.type(sample, { delay: 8 });

  const correctCharacters = page.locator('.passage-card .correct');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length);
  await expect(page.locator('.passage-card .incorrect')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length - 1);
  await page.keyboard.type(Array.from(sample).at(-1) ?? '');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length);
});
