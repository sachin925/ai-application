'use strict';

const { test, expect } = require('./fixtures');

test('mock AI summary is deterministic and flagged as grounded', async ({ appPage: page, request }) => {
  const apiBody = await (await request.post('/api/notes/note_seed_5/summarize')).json();

  await page.getByTestId('note-summarize-button').first().click();

  const summary = page.getByTestId('summary-text');
  await expect(summary).toHaveText(apiBody.summary);
  await expect(summary).toHaveAttribute('data-provider', 'mock');
  await expect(page.getByTestId('summary-verified')).toBeVisible();
  await expect(page.getByTestId('summary-warning')).toBeHidden();
  expect(apiBody.faithfulness.grounded).toBe(true);
});
