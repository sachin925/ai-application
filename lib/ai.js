'use strict';

const DEFAULT_DELAY_MS = Number(process.env.MOCK_AI_DELAY_MS || 300);
const MODES = ['normal', 'hallucinate', 'malformed', 'slow', 'error'];

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'been',
  'note', 'summary', 'output', 'previous', 'instructions',
]);

const HALLUCINATED_SUMMARY =
  'This note confirms a secret launch on Mars next Tuesday, and the author has been selected for a free cruise.';

let mode = normalizeMode(process.env.AI_MODE);
let modeDelayMs = null;

function normalizeMode(value) {
  return MODES.includes(value) ? value : 'normal';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentWords(text) {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
  return words.filter((w) => !STOPWORDS.has(w));
}

function faithfulnessOf(summary, note) {
  const summaryWords = new Set(contentWords(summary));
  if (summaryWords.size === 0) return { score: 0, grounded: false };
  const sourceWords = new Set(contentWords(`${note.title} ${note.body}`));
  let hits = 0;
  for (const word of summaryWords) {
    if (sourceWords.has(word)) hits += 1;
  }
  const score = Math.round((hits / summaryWords.size) * 100) / 100;
  return { score, grounded: score >= 0.4 };
}

function mockSummary(note) {
  const text = `${note.title}. ${note.body}`.replace(/\s+/g, ' ').trim();
  return text.length <= 140 ? `Summary: ${text}` : `Summary: ${text.slice(0, 137)}...`;
}

async function openaiSummary(note) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarize the user\'s note in exactly one sentence.' },
          { role: 'user', content: `${note.title}\n\n${note.body}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI responded ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function summarize(note) {
  const waitMs = mode === 'slow' ? modeDelayMs || 2500 : DEFAULT_DELAY_MS;
  await delay(waitMs);

  if (mode === 'error') {
    const fallback = mockSummary(note);
    return {
      provider: 'mock',
      fallback: true,
      error: 'ai_provider_failed',
      summary: fallback,
      faithfulness: faithfulnessOf(fallback, note),
    };
  }

  if (mode === 'malformed') {
    return {
      provider: 'mock',
      error: 'invalid_ai_output',
      summary: '',
      faithfulness: { score: 0, grounded: false },
    };
  }

  if (mode === 'hallucinate') {
    return {
      provider: 'mock',
      simulated: 'hallucination',
      summary: HALLUCINATED_SUMMARY,
      faithfulness: faithfulnessOf(HALLUCINATED_SUMMARY, note),
    };
  }

  if (mode === 'normal' && process.env.OPENAI_API_KEY) {
    try {
      const summary = await openaiSummary(note);
      return { provider: 'openai', summary, faithfulness: faithfulnessOf(summary, note) };
    } catch {
      // fall through to the deterministic mock
    }
  }

  const summary = mockSummary(note);
  return { provider: 'mock', summary, faithfulness: faithfulnessOf(summary, note) };
}

function getMode() {
  return { mode, delayMs: modeDelayMs };
}

function setMode(next) {
  mode = normalizeMode(next.mode);
  if (next.delayMs) modeDelayMs = Number(next.delayMs);
  return getMode();
}

function resetMode() {
  mode = normalizeMode(process.env.AI_MODE);
  modeDelayMs = null;
  return getMode();
}

module.exports = { summarize, faithfulnessOf, getMode, setMode, resetMode, MODES };
