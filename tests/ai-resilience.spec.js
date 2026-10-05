'use strict';

const { test, expect } = require('./fixtures');

test('provider failure falls back transparently instead of crashing', async ({ appPage: page, request }) => {
  await request.put('/api/test/ai-mode', { data: { mode: 'error' } });

  await page.getByTestId('note-summarize-button').first().click();

  const summary = page.getByTestId('summary-text');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('data-provider', 'mock');
  await expect(page.getByTestId('summary-warning')).toContainText('AI provider unavailable');
});

test('malformed provider output is rejected with a clean error', async ({ appPage: page, request }) => {
  await request.put('/api/test/ai-mode', { data: { mode: 'malformed' } });

  const apiResponse = await request.post('/api/notes/note_seed_5/summarize');
  expect(apiResponse.status()).toBe(502);
  const apiBody = await apiResponse.json();
  expect(apiBody.error).toBe('invalid_ai_output');

  await page.getByTestId('note-summarize-button').first().click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('invalid_ai_output');
});

test('slow response keeps the loading state visible until the result', async ({ appPage: page, request }) => {
  await request.put('/api/test/ai-mode', { data: { mode: 'slow', delayMs: 2500 } });

  await page.getByTestId('note-summarize-button').first().click();

  await expect(page.getByTestId('summary-loading')).toBeVisible();
  await expect(page.getByTestId('summary-loading')).toBeHidden();
  await expect(page.getByTestId('summary-text')).toBeVisible();
  await expect(page.getByTestId('summary-verified')).toBeVisible();
});

test('reset hook restores both data and AI mode', async ({ appPage: page, request }) => {
  await request.put('/api/test/ai-mode', { data: { mode: 'hallucinate' } });
  await page.getByTestId('note-delete-button').first().click();

  await request.post('/api/test/reset');

  const mode = await (await request.get('/api/test/ai-mode')).json();
  expect(mode.mode).toBe('normal');
  const seed = await (await request.get('/api/test/seed')).json();
  expect(seed.notes).toHaveLength(5);
  await expect(page.getByTestId('note-item')).toHaveCount(5);
});
