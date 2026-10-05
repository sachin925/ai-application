'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // The AI simulator mode (PUT /api/test/ai-mode) is global to the app
  // instance, so tests must not run in parallel against it.
  workers: 1,
  // Deterministic mock AI: a failure is a real failure, do not mask it.
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
