'use strict';

const { test, expect } = require('./fixtures');

// With a real LLM, output is non-deterministic: assert soft properties
// (shape, bounds, groundedness handling) instead of exact text.
test('real LLM output satisfies soft properties', async ({ appPage: page }) => {
  test.skip(!process.env.OPENAI_API_KEY, 'Set OPENAI_API_KEY to run against a real LLM');

  await page.getByTestId('note-summarize-button').first().click();

  const summary = page.getByTestId('summary-text');
  await expect(summary).toBeVisible();
  const text = await summary.innerText();
  expect(text.length).toBeGreaterThan(10);
  expect(text.length).toBeLessThan(400);
  await expect(
    page.getByTestId('summary-verified').or(page.getByTestId('summary-warning'))
  ).toBeVisible();
});
