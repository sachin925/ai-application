# AI Testing Requirements Showcase

This project doubles as a **teaching/showcase target for AI-specific test automation**.
Classic apps need CRUD tests; AI apps add a new risk layer — the model itself is a
non-deterministic dependency. This document maps each AI test requirement to the
mechanism the app provides and the test that demonstrates it.

## The core problem

You cannot write stable assertions against a real LLM: the same prompt can produce
different wording, hallucinated facts, slow responses, or failures. So this app ships
an **AI simulator** — the `PUT /api/test/ai-mode` hook makes the AI layer behave in a
controlled, deterministic way, so each risk becomes reproducible in a test.

| Simulator mode | Simulated risk |
|---|---|
| `normal` (default) | Healthy provider. Mock LLM returns deterministic output (or real LLM if `OPENAI_API_KEY` is set). |
| `hallucinate` | Model output is fluent but **not supported by the source text**. |
| `malformed` | Provider returns an unusable response (empty summary). |
| `error` | Provider is down; app must fall back or fail gracefully. |
| `slow` (`delayMs`) | High latency; loading-state and wait-strategy testing. |

`POST /api/test/reset` restores both the seed data **and** the simulator mode.

## Requirement → test mapping

| # | AI test requirement | App behavior under test | Test |
|---|---|---|---|
| 1 | **Determinism / contract** | Mock mode output is byte-stable; response carries `provider` and `faithfulness`. UI must match API. | `tests/ai-baseline.spec.js` |
| 2 | **Hallucination** | App runs a groundedness check (token overlap vs. source) and shows a "may contain inaccuracies" badge instead of presenting AI text as fact. Test asserts the flag **and** that a fabricated claim never appears unflagged. | `tests/ai-hallucination.spec.js` |
| 3 | **Non-determinism (real LLM)** | With `OPENAI_API_KEY` set, exact-match assertions are invalid — assert *properties*: non-empty, bounded length, and that *some* trust indicator is rendered. | `tests/ai-real-llm.spec.js` |
| 4 | **Malformed output / contract validation** | Empty AI response → API rejects with `502 invalid_ai_output`; UI shows a toast instead of blank output. | `tests/ai-resilience.spec.js` |
| 5 | **Provider failure / resilience** | Downstream failure → deterministic fallback summary + "AI provider unavailable" badge. Never a white screen. | `tests/ai-resilience.spec.js` |
| 6 | **Latency / async UX** | Slow mode keeps `summary-loading` visible; tests use auto-waiting assertions, never `sleep()`. | `tests/ai-resilience.spec.js` |
| 7 | **Prompt injection** | Note bodies are untrusted data: injected instructions must not be obeyed, and AI output is rendered as text (no HTML/XSS). | `tests/ai-injection.spec.js` |
| 8 | **State isolation for AI tests** | Reset restores data *and* simulator mode, so a failed test can't leak `hallucinate` mode into the next one. | `tests/ai-resilience.spec.js` |

## Key testing principles demonstrated

1. **Test the seams, not the model.** The groundedness score, fallback flag, and
   simulator modes are deterministic *seams* around the probabilistic model.
2. **Hallucination is a product requirement, not just a model flaw.** The test asserts
   the mitigation (flagging), because you can never assert the absence of hallucination
   in real model output.
3. **Property-based assertions for real models.** Run `OPENAI_API_KEY=... npm test` to
   see the same suite switch from exact-match (mock) to property-based (real LLM).
4. **AI state is test state.** Simulator mode is global — the suite runs `workers: 1`
   so parallel tests can't flip each other's AI behavior mid-flight.

## Running the showcase

```bash
npm install
npx playwright install chromium   # once
npm start                         # or let Playwright start it via webServer
npm test                          # 7 deterministic tests + 1 skipped

OPENAI_API_KEY=sk-... npm test    # also runs the real-LLM property test
BASE_URL=http://localhost:3000 npm test   # point at a Docker/CI instance
```

## Porting to your own automation repo

The suite is self-contained: copy `playwright.config.js` and `tests/` into any repo,
`npm i -D @playwright/test`, and adjust `baseURL`/`webServer` to point at a running
instance of this app. The only contract the tests rely on is documented in the root
`README.md` (testids, test hooks, response shapes).
