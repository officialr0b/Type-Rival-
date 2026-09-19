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
  // Type immediately: the race intentionally restores input focus after a
  // short delay, which made a separate focus assertion timing-sensitive.
  await page.keyboard.type(sample, { delay: 8 });

  const correctCharacters = page.locator('.passage-card .correct');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length);
  await expect(page.locator('.passage-card .incorrect')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length - 1);
  await page.keyboard.type(Array.from(sample).at(-1) ?? '');
  await expect(correctCharacters).toHaveCount(Array.from(sample).length);
});

test('stenography mode accepts translated text in its own race lane', async ({ page }) => {
  await page.goto('/?age=adult');
  await expect(page.getByText('LOCAL PLAYER', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'PRACTICE NOW' }).click();
  await page.getByRole('button', { name: 'STENO' }).click();
  await expect(page.getByText(/self-declared/)).toBeVisible();
  await page.getByRole('button', { name: 'START 45-SECOND RUN' }).click();
  await page.getByRole('button', { name: 'TAP TO START' }).click();

  const passage = page.locator('[aria-label^="Typing passage:"]');
  await expect(passage).toBeVisible({ timeout: 7_000 });
  const passageText = (await passage.getAttribute('aria-label'))?.replace(/^Typing passage:\s*/, '') ?? '';
  const translatedChunk = Array.from(passageText).slice(0, 12).join('');
  const field = page.getByLabel('Race typing input');
  await field.focus();
  // Plover/CAT software commonly commits translated text through the browser's
  // text insertion path rather than one physical keydown per character.
  await page.keyboard.insertText(translatedChunk);

  await expect(page.locator('.passage-card .correct')).toHaveCount(Array.from(translatedChunk).length);
  await expect(page.getByText('STENO OUTPUT READY')).toBeVisible();
});
