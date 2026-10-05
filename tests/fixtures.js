'use strict';

const { test: base, expect } = require('@playwright/test');

exports.expect = expect;

exports.test = base.extend({
  // Provides a logged-in page plus guaranteed known state:
  // seed data restored and the AI simulator in normal mode.
  appPage: async ({ page, request }, use) => {
    await request.post('/api/test/reset');
    await request.put('/api/test/ai-mode', { data: { mode: 'normal' } });
    await request.post('/api/login', {
      data: { email: 'demo@ainotes.app', password: 'password123' },
    });
    await page.goto('/login');
    await page.getByTestId('email-input').fill('demo@ainotes.app');
    await page.getByTestId('password-input').fill('password123');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('notes-list')).toBeVisible();
    await use(page);
  },
});
