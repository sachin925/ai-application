# AGENTS.md

## Project overview

**AI Notes** (`ai-application`) — a small AI-powered notes web app built as a
deliberately automation-friendly target for external test-automation repos.
Server-rendered vanilla JS frontend + JSON REST API, session-cookie auth, notes
CRUD, search/sort, and an AI "Summarize" feature with a deterministic mock mode
(no API key needed by default).

Stack: Node.js (CommonJS, no build step), Express (the only production dependency),
JSON-file persistence. No framework, no transpiler, no test suite of its own —
testing happens from a separate automation repository against a running instance.

## Commands

- `npm install` — install dependencies (requires Node >= 18).
- `npm start` — start the app at http://localhost:3000 (`PORT` env overrides).
- `npm run dev` — same, with `--watch`.
- Docker: `docker build -t ai-notes . && docker run -p 3000:3000 ai-notes`
  (or `docker compose up`).

Demo login: `demo@ainotes.app / password123` (seeded user in `data/seed.json`).

## Layout

- `server.js` — Express app: auth (HMAC-signed session cookie), all `/api/*`
  routes, page routes (`/` and `/login` with server-side redirects), test hooks.
- `lib/db.js` — JSON-file store. `data/db.json` is created from `data/seed.json`
  on first run; `POST /api/test/reset` restores it.
- `lib/ai.js` — summarize provider with a built-in **AI simulator** (modes:
  `normal`, `hallucinate`, `malformed`, `error`, `slow`). OpenAI when
  `OPENAI_API_KEY` is set, otherwise a deterministic mock with `MOCK_AI_DELAY_MS`
  (default 300 ms) latency. Every response includes a `faithfulness` score
  (token overlap vs. source note; grounded below 0.4) and may include `fallback`
  or `simulated` markers.
- `tests/` + `playwright.config.js` — self-contained showcase suite (Playwright)
  demonstrating AI-specific testing; portable to external automation repos.
  Runs `workers: 1` because simulator mode is global to the app instance.
- `public/` — static frontend (`login.html` + `login.js`, `app.html` + `app.js`,
  `styles.css`). Served under `/static`; pages served at `/` and `/login`.
- `data/seed.json` — seed user + 5 notes with fixed timestamps (automation
  asserts against these).

## Conventions (load-bearing for automation — do not regress)

- Every interactive element carries a **`data-testid`** attribute; the full list
  is documented in `README.md`. New UI elements must add one.
- **No native dialogs** (`alert`/`confirm`), no CSS animations/transitions —
  interactions are plain clicks with immediate DOM effects.
- Delete uses a **two-step inline confirmation** (button becomes
  `Confirm delete` with `data-confirming="true"` for 3 s).
- Search input is **debounced 250 ms**; AI summarize has a visible loading state.
- All responses send `Cache-Control: no-store`.
- Error bodies are JSON: `{ "error": "<code>" }`.

## Test hooks and verification

- `POST /api/test/reset` (also resets simulator mode), `GET /api/test/seed`,
  `GET`/`PUT /api/test/ai-mode` — enabled unless `ENABLE_TEST_HOOKS=0`.
  External automation repos call reset before each test.
- Summary UI shows `summary-verified` or `summary-warning` badges based on
  `faithfulness.grounded` / `fallback`; the `[hidden]` CSS guard is load-bearing
  (badge classes set `display` and would otherwise defeat `hidden`).
- Verify changes by starting the server and exercising the API + pages; a curl
  checklist covering login, CRUD, search/sort, summarize, reset, and testid
  presence lives in the project history and in `README.md`.
