# AI Notes

A small AI-powered notes app built to be a **friendly, deterministic target for test automation** —
including AI-specific testing: hallucination, groundedness, provider failure, malformed output,
latency, and prompt injection. See `docs/AI-TESTING.md` for the full showcase mapping.

It has login, full notes CRUD, search/sort, and an AI "Summarize" feature with a
**built-in AI simulator** (test-hook controlled) plus a groundedness check that flags
unverified AI output. The AI runs in a deterministic mock mode by default (no API key required).

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Demo login: **demo@ainotes.app / password123**

Requires Node.js >= 18. The only dependency is Express. Data persists to `data/db.json`,
which is created from `data/seed.json` on first run.

## Why this app is automation-friendly

- **`data-testid` attributes** on every interactive element (full list below).
- **No native dialogs** — delete is a two-step inline confirmation, no `alert`/`confirm`.
- **No animations or transitions** — elements are either present or not.
- **Deterministic AI** — with no `OPENAI_API_KEY`, summaries are mocked, byte-for-byte stable.
- **State reset endpoint** — `POST /api/test/reset` restores seed data between tests.
- **Session auth via cookie** — works with Playwright/Selenium/Cypress cookie handling.
- **`Cache-Control: no-store`** on all responses — no stale-page flakiness.
- **Debounce on search** (250 ms) and a **loading state** on AI calls — good practice
  targets for explicit waits.

## Test hooks

Enabled by default; disable in "production" with `ENABLE_TEST_HOOKS=0`.

| Endpoint | Description |
|---|---|
| `POST /api/test/reset` | Restore the database to `data/seed.json` (5 notes) **and** reset the AI simulator to normal mode. Call before each test. |
| `GET /api/test/seed` | Return the seed data so tests can assert against known values. |
| `GET /api/test/ai-mode` | Return the current AI simulator mode. |
| `PUT /api/test/ai-mode` | Set the simulator: `{ "mode": "normal" \| "hallucinate" \| "malformed" \| "error" \| "slow", "delayMs"?: number }`. Lets tests reproduce AI failure modes deterministically. |

**AI response shape** (`POST /api/notes/:id/summarize`):

```json
{
  "provider": "mock | openai",
  "summary": "…",
  "faithfulness": { "score": 0.95, "grounded": true },
  "fallback": false,
  "simulated": "hallucination"
}
```

`fallback` is true when the real provider failed and a fallback summary was used;
`simulated` marks simulator-driven output; malformed output yields `502 invalid_ai_output`.
The UI reflects these as `data-testid="summary-verified"` and `data-testid="summary-warning"` badges.

## Using it from your automation repo

Start the app, then point your framework at `http://localhost:3000`.

**Playwright example:**

```js
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.beforeEach(async ({ request }) => {
  await request.post(`${BASE}/api/test/reset`);   // known state before every test
});

test('create and summarize a note', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByTestId('email-input').fill('demo@ainotes.app');
  await page.getByTestId('password-input').fill('password123');
  await page.getByTestId('login-button').click();

  await page.getByTestId('note-title-input').fill('Buy groceries');
  await page.getByTestId('note-tags-input').fill('personal, shopping');
  await page.getByTestId('note-save-button').click();
  await expect(page.getByTestId('note-title').first()).toHaveText('Buy groceries');

  await page.getByTestId('note-summarize-button').first().click();
  await expect(page.getByTestId('summary-text')).toBeVisible();
});
```

Selenium/Cypress work the same way: locate by `data-testid`, reset state via the API,
assert on the deterministic mock summary (`Summary: <title>. <body>`).

### `data-testid` reference

Login page: `login-form`, `email-input`, `password-input`, `login-button`, `login-error`

App page: `user-email`, `logout-button`, `note-form`, `form-heading`, `note-title-input`,
`note-body-input`, `note-tags-input`, `note-save-button`, `cancel-edit-button`,
`search-input`, `sort-select` (values `updated-desc`, `updated-asc`, `title-asc`, `title-desc`),
`summary-panel`, `summary-loading`, `summary-text`, `summary-verified`, `summary-warning`,
`notes-list`, `notes-empty`, `toast`,
and per note: `note-item`, `note-title`, `note-body-preview`, `note-tags`,
`note-summarize-button`, `note-edit-button`, `note-delete-button` (becomes
`Confirm delete` with `data-confirming="true"` on first click).

The summary text element also carries `data-provider` (`mock`/`openai`),
`data-faithfulness` (0–1 score), and `data-simulated` (when simulator-driven).

### Scenarios worth automating

- Login valid/invalid, session persistence across reloads, logout redirect.
- CRUD: create (title required — 400), edit via form prefill, two-step delete.
- Search filter (debounced) and all four sort orders.
- Summary: loading state visibility, deterministic text, provider attribute.
- Auth guards: `GET /` redirects to `/login`, API returns 401 without cookie.
- AI risks via the simulator (see `docs/AI-TESTING.md`): hallucination flagging,
  malformed output (502), provider fallback, slow-response waits, prompt injection.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listen port. |
| `DATA_FILE` | `data/db.json` | JSON database location. |
| `SESSION_SECRET` | dev value | HMAC secret for session cookies. Override in any shared environment. |
| `ENABLE_TEST_HOOKS` | `1` | Set to `0` to disable `/api/test/*` endpoints. |
| `OPENAI_API_KEY` | unset | If set, summaries call OpenAI (model: `OPENAI_MODEL`, default `gpt-4o-mini`). Falls back to mock on error. |
| `MOCK_AI_DELAY_MS` | `300` | Artificial latency so loading states are observable. |
| `AI_MODE` | `normal` | Initial simulator mode (`normal`/`hallucinate`/`malformed`/`error`/`slow`). Tests override it via `PUT /api/test/ai-mode`. |

## API reference

All API routes return JSON. Auth routes are public; everything else requires the session cookie.

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `POST /api/login` | `{email, password}` | 200 `{user}` | Sets session cookie. 401 `invalid_credentials`. |
| `POST /api/logout` | — | 200 `{ok}` | Clears cookie. |
| `GET /api/me` | — | 200 `{user}` | 401 if not logged in. |
| `GET /api/notes` | query: `q`, `sort`, `order` | 200 `{notes}` | sort ∈ `updated`/`created`/`title`. |
| `POST /api/notes` | `{title, body, tags[]}` | 201 `{note}` | 400 `title_required`. |
| `GET /api/notes/:id` | — | 200 `{note}` | 404 if missing. |
| `PUT /api/notes/:id` | `{title, body, tags[]}` | 200 `{note}` | 404 / 400. |
| `DELETE /api/notes/:id` | — | 200 `{ok}` | 404 if missing. |
| `POST /api/notes/:id/summarize` | — | 200 `{provider, summary, faithfulness}` | See response shape above. 502 `invalid_ai_output`. |

## Bundled test suite (showcase)

A self-contained Playwright suite lives in `tests/` and doubles as a reference
implementation you can copy into a separate automation repo (only contract it
needs: this README's testids + test hooks + `BASE_URL`).

```bash
npx playwright install chromium   # once
npm test                          # Playwright also auto-starts the app via webServer
OPENAI_API_KEY=sk-... npm test    # additionally runs the real-LLM property test
```

It demonstrates AI-specific testing (hallucination, injection, resilience, latency)
— each requirement is mapped to a test in `docs/AI-TESTING.md`.

## Docker

```bash
docker build -t ai-notes .
docker run -p 3000:3000 ai-notes
# or
docker compose up
```

The container listens on port 3000 with test hooks enabled — point CI at it directly.

## Note on security

This is a demo/test target: the password is stored in plaintext in `data/seed.json`,
sessions are a signed cookie with a dev-default secret, and there is no CSRF protection
(same-origin JSON API + `SameSite=Lax`). Do not deploy it with real data.
