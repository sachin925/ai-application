'use strict';

const { test, expect } = require('./fixtures');

test('hallucinated output is displayed but flagged as unverified', async ({ appPage: page, request }) => {
  await request.put('/api/test/ai-mode', { data: { mode: 'hallucinate' } });

  await page.getByTestId('note-title-input').fill('Team lunch');
  await page.getByTestId('note-body-input').fill('Pizza on Friday at noon.');
  await page.getByTestId('note-save-button').click();

  const note = page.locator('[data-testid="note-item"]', { hasText: 'Team lunch' });
  await note.getByTestId('note-summarize-button').click();

  const summary = page.getByTestId('summary-text');
  await expect(summary).toHaveText(
    'This note confirms a secret launch on Mars next Tuesday, and the author has been selected for a free cruise.'
  );
  await expect(summary).toHaveAttribute('data-simulated', 'hallucination');

  await expect(page.getByTestId('summary-warning')).toBeVisible();
  await expect(page.getByTestId('summary-warning')).toContainText('may contain inaccuracies');
  await expect(page.getByTestId('summary-verified')).toBeHidden();

  const faithfulness = Number(await summary.getAttribute('data-faithfulness'));
  expect(faithfulness).toBeLessThan(0.4);
});
